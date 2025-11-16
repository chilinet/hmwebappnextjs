#!/usr/bin/env python3
"""
Synchronisiert die Asset-Struktur von ThingsBoard und speichert sie in customer_settings.tree
Analog zu pages/api/config/customers/tree/[id].js
"""

import os
import sys
import json
import uuid
import argparse
import asyncio
import aiohttp
from datetime import datetime
from typing import Dict, List, Any, Optional, Set
import pyodbc
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

# Lade .env Datei
load_dotenv()

# Konfiguration aus Umgebungsvariablen
THINGSBOARD_URL = os.getenv('THINGSBOARD_URL', 'https://thingsboard.heatmanager.de')
MSSQL_SERVER = os.getenv('MSSQL_SERVER')
MSSQL_DATABASE = os.getenv('MSSQL_DATABASE')
MSSQL_USER = os.getenv('MSSQL_USER')
MSSQL_PASSWORD = os.getenv('MSSQL_PASSWORD')
THINGSBOARD_TOKEN = os.getenv('THINGSBOARD_TOKEN')  # Fallback Token

# Timeout-Konfiguration
ASSET_LIST_TIMEOUT = 15
RELATION_TIMEOUT_BASE = 15
RELATION_MAX_RETRIES = 2
DEVICE_DETAILS_TIMEOUT = 10
ATTRIBUTES_TIMEOUT = 5

# Logging
LOG_DIR = 'logs'
STRUCTURE_LOG_FILE = os.path.join(LOG_DIR, 'structure-creation.log')
SCRIPT_LOG_FILE = os.path.join(LOG_DIR, 'sync_structure.log')

def ensure_log_dir():
    """Erstellt das logs-Verzeichnis falls es nicht existiert"""
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)

def write_to_log_file(log_file: str, message: str):
    """Schreibt eine Nachricht in die Log-Datei"""
    ensure_log_dir()
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(message)

def log_info(message: str, data: Optional[Dict] = None):
    """Loggt eine Info-Nachricht"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [INFO] {message}"
    if data:
        log_entry += f" | {json.dumps(data)}"
    log_entry += "\n"
    
    # Schreibe in beide Log-Dateien
    write_to_log_file(STRUCTURE_LOG_FILE, log_entry)
    write_to_log_file(SCRIPT_LOG_FILE, log_entry)
    print(f"INFO: {message}")

def log_warn(message: str, data: Optional[Dict] = None):
    """Loggt eine Warnung"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [WARN] {message}"
    if data:
        log_entry += f" | {json.dumps(data)}"
    log_entry += "\n"
    
    # Schreibe in beide Log-Dateien
    write_to_log_file(STRUCTURE_LOG_FILE, log_entry)
    write_to_log_file(SCRIPT_LOG_FILE, log_entry)
    print(f"WARN: {message}")

def log_error(message: str, error: Optional[Exception] = None):
    """Loggt einen Fehler"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [ERROR] {message}"
    if error:
        log_entry += f" | {str(error)}"
    log_entry += "\n"
    
    # Schreibe in beide Log-Dateien
    write_to_log_file(STRUCTURE_LOG_FILE, log_entry)
    write_to_log_file(SCRIPT_LOG_FILE, log_entry)
    print(f"ERROR: {message}", file=sys.stderr)
    if error:
        print(f"  {str(error)}", file=sys.stderr)

def start_structure_creation_log(customer_id: str) -> str:
    """Startet eine neue Struktur-Erstellungs-Session"""
    session_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [START] Structure creation started | sessionId={session_id} | customerId={customer_id}\n"
    
    # Schreibe in beide Log-Dateien
    write_to_log_file(STRUCTURE_LOG_FILE, log_entry)
    write_to_log_file(SCRIPT_LOG_FILE, log_entry)
    print(f"START: Structure creation started (sessionId={session_id}, customerId={customer_id})")
    return session_id

def end_structure_creation_log(session_id: str, summary: Dict):
    """Beendet eine Struktur-Erstellungs-Session"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [END] Structure creation completed | sessionId={session_id} | {json.dumps(summary)}\n"
    
    # Schreibe in beide Log-Dateien
    write_to_log_file(STRUCTURE_LOG_FILE, log_entry)
    write_to_log_file(SCRIPT_LOG_FILE, log_entry)
    print(f"END: Structure creation completed (sessionId={session_id})")

def get_db_connection():
    """Erstellt eine Datenbankverbindung"""
    connection_string = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={MSSQL_SERVER};"
        f"DATABASE={MSSQL_DATABASE};"
        f"UID={MSSQL_USER};"
        f"PWD={MSSQL_PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
    )
    return pyodbc.connect(connection_string)

def get_thingsboard_token(customer_id: str) -> str:
    """Holt den ThingsBoard Token aus der customer_settings Tabelle für die gegebene customer_id"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT tbtoken
            FROM customer_settings 
            WHERE customer_id = ?
        """, (customer_id,))
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row and row[0]:
            token = row[0]
            if token and token.strip():  # Prüfe ob Token nicht leer ist
                log_info(f"ThingsBoard token loaded from database for customer {customer_id}")
                return token.strip()
            else:
                log_warn(f"Token in database is empty for customer {customer_id}")
        else:
            log_warn(f"No token found in database for customer {customer_id}")
            
    except Exception as e:
        log_error(f"Could not get token from DB: {e}")
    
    # Fallback zu ENV
    if THINGSBOARD_TOKEN:
        log_info(f"Using ThingsBoard token from environment variable")
        return THINGSBOARD_TOKEN
    
    raise ValueError(f"No ThingsBoard token available for customer {customer_id}. Set THINGSBOARD_TOKEN env var or ensure customer_settings.tbtoken has a valid token.")

async def fetch_with_timeout(session: aiohttp.ClientSession, url: str, headers: Dict, timeout: int) -> Optional[Dict]:
    """Führt einen HTTP-Request mit Timeout aus"""
    try:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=timeout)) as response:
            if response.status == 200:
                return await response.json()
            else:
                log_warn(f"HTTP {response.status} for {url}")
                return None
    except asyncio.TimeoutError:
        log_warn(f"Timeout after {timeout}s for {url}")
        return None
    except Exception as e:
        log_warn(f"Error fetching {url}: {e}")
        return None

async def fetch_with_retry(session: aiohttp.ClientSession, url: str, headers: Dict, 
                          base_timeout: int, max_retries: int, asset_name: str, 
                          session_id: str, request_type: str) -> Optional[List]:
    """Führt einen HTTP-Request mit Retry-Logik aus"""
    for attempt in range(max_retries + 1):
        timeout = base_timeout + (attempt * 5000)  # 15s, 20s, 25s
        
        try:
            result = await fetch_with_timeout(session, url, headers, timeout)
            if result is not None:
                if attempt > 0:
                    log_info(f"{request_type} erfolgreich nach {attempt} Retry(s) für {asset_name}", {
                        'sessionId': session_id,
                        'attempt': attempt,
                        'relationsCount': len(result) if isinstance(result, list) else 0
                    })
                return result if isinstance(result, list) else []
        except Exception as e:
            if attempt < max_retries:
                log_warn(f"Timeout beim Abrufen der {request_type} für {asset_name} (Versuch {attempt + 1}/{max_retries + 1}), retry...", {
                    'sessionId': session_id,
                    'attempt': attempt + 1,
                    'timeout': timeout
                })
                await asyncio.sleep(1 * (attempt + 1))  # Exponential backoff
                continue
            else:
                log_warn(f"Timeout beim Abrufen der {request_type} für {asset_name} nach {max_retries + 1} Versuchen", {
                    'sessionId': session_id,
                    'maxRetries': max_retries + 1
                })
                return []
    
    return []

async def fetch_asset_attributes(session: aiohttp.ClientSession, asset_id: str, 
                                 tb_token: str, session_id: str) -> Dict:
    """Holt Asset-Attribute von ThingsBoard"""
    url = f"{THINGSBOARD_URL}/api/plugins/telemetry/ASSET/{asset_id}/values/attributes"
    headers = {'X-Authorization': f'Bearer {tb_token}'}
    
    attributes = await fetch_with_timeout(session, url, headers, ATTRIBUTES_TIMEOUT)
    
    if not attributes:
        return {}
    
    # Extrahiere die gewünschten Attribute
    attribute_keys = [
        'operationalMode', 'childLock', 'fixValue', 'maxTemp', 'minTemp',
        'extTempDevice', 'overruleMinutes', 'runStatus', 'schedulerPlan'
    ]
    
    extracted = {}
    if isinstance(attributes, list):
        for attr in attributes:
            if attr.get('key') in attribute_keys:
                extracted[attr['key']] = attr.get('value')
    
    return extracted

def build_sub_tree(asset: Dict, asset_map: Dict[str, Dict]) -> Dict:
    """Baut einen Subtree rekursiv auf"""
    node = {
        'id': asset['id'],
        'name': asset['name'],
        'type': asset['type'],
        'label': asset.get('label', ''),
        'hasDevices': asset.get('hasDevices', False),
        'children': []
    }
    
    # Sortiere Children nach Name
    children = sorted(asset.get('children', []), key=lambda x: x.get('name', ''))
    node['children'] = [build_sub_tree(child, asset_map) for child in children]
    
    # Füge relatedDevices hinzu wenn vorhanden
    if asset.get('hasDevices') and asset.get('relatedDevices'):
        node['relatedDevices'] = asset['relatedDevices']
    
    # Füge Asset-Attribute hinzu
    attribute_keys = [
        'operationalMode', 'childLock', 'fixValue', 'maxTemp', 'minTemp',
        'extTempDevice', 'overruleMinutes', 'runStatus', 'schedulerPlan'
    ]
    
    for key in attribute_keys:
        if key in asset and asset[key] is not None:
            node[key] = asset[key]
    
    return node

async def fetch_asset_tree(customer_id: str, tb_token: str) -> List[Dict]:
    """Holt und baut die Asset-Struktur auf"""
    session_id = start_structure_creation_log(customer_id)
    
    try:
        log_info(f"Starting asset tree fetch for customer {customer_id}", {'sessionId': session_id})
        
        async with aiohttp.ClientSession() as session:
            # 1. Hole alle Assets
            log_info('Fetching assets list from ThingsBoard', {'sessionId': session_id})
            assets_url = f"{THINGSBOARD_URL}/api/customer/{customer_id}/assets?pageSize=10000&page=0"
            headers = {'X-Authorization': f'Bearer {tb_token}'}
            
            assets_data = await fetch_with_timeout(session, assets_url, headers, ASSET_LIST_TIMEOUT)
            if not assets_data or 'data' not in assets_data:
                raise ValueError("Failed to fetch assets")
            
            assets = assets_data['data']
            log_info(f"Fetched {len(assets)} assets", {'sessionId': session_id, 'assetCount': len(assets)})
            
            # 2. Erstelle Asset-Map
            asset_map = {}
            for asset in assets:
                asset_id = asset['id']['id']
                asset_map[asset_id] = {
                    'id': asset_id,
                    'name': asset['name'],
                    'type': asset.get('type', ''),
                    'label': asset.get('label', ''),
                    'children': [],
                    'parentId': None,
                    'hasDevices': False,
                    'relatedDevices': [],
                    'operationalMode': None,
                    'childLock': None,
                    'fixValue': None,
                    'maxTemp': None,
                    'minTemp': None,
                    'extTempDevice': None,
                    'overruleMinutes': None,
                    'runStatus': None,
                    'schedulerPlan': None
                }
            
            # 3. Hole Relations für alle Assets (mit Retry)
            log_info(f"Fetching relations for {len(assets)} assets", {'sessionId': session_id})
            relation_tasks = []
            for asset in assets:
                asset_id = asset['id']['id']
                asset_name = asset['name']
                
                # Asset-Relations (fromId = Asset als Parent)
                asset_relations_url = f"{THINGSBOARD_URL}/api/relations/info?fromId={asset_id}&fromType=ASSET"
                task1 = fetch_with_retry(session, asset_relations_url, headers, 
                                        RELATION_TIMEOUT_BASE, RELATION_MAX_RETRIES,
                                        asset_name, session_id, "Asset-Relations (fromId)")
                
                # Asset-Relations (toId = Asset als Child) - WICHTIG für Assets die nur als Child existieren
                asset_relations_to_url = f"{THINGSBOARD_URL}/api/relations/info?toId={asset_id}&toType=ASSET"
                task1b = fetch_with_retry(session, asset_relations_to_url, headers,
                                         RELATION_TIMEOUT_BASE, RELATION_MAX_RETRIES,
                                         asset_name, session_id, "Asset-Relations (toId)")
                
                # Device-Relations
                device_relations_url = f"{THINGSBOARD_URL}/api/relations/info?fromId={asset_id}&fromType=ASSET&relationType=Contains&toType=DEVICE"
                task2 = fetch_with_retry(session, device_relations_url, headers,
                                        RELATION_TIMEOUT_BASE, RELATION_MAX_RETRIES,
                                        asset_name, session_id, "Device-Relations")
                
                relation_tasks.append((asset, task1, task1b, task2))
            
            # Warte auf alle Relations
            all_device_ids = set()
            relations_results = []
            
            for asset, asset_task_from, asset_task_to, device_task in relation_tasks:
                asset_relations_from = await asset_task_from or []
                asset_relations_to = await asset_task_to or []
                device_relations = await device_task or []
                
                asset_id = asset['id']['id']
                asset_name = asset['name']
                
                # Debug-Logging für Assets ohne Relations
                if len(asset_relations_from) == 0 and len(asset_relations_to) == 0:
                    log_info(f"Asset {asset_name} has no relations (fromId: 0, toId: 0)", {
                        'sessionId': session_id,
                        'assetId': asset_id
                    })
                elif len(asset_relations_from) > 0 or len(asset_relations_to) > 0:
                    # Logge Details über gefundene Relations
                    from_relations_count = len(asset_relations_from)
                    to_relations_count = len(asset_relations_to)
                    log_info(f"Asset {asset_name} relations: fromId={from_relations_count}, toId={to_relations_count}", {
                        'sessionId': session_id,
                        'assetId': asset_id,
                        'fromIdCount': from_relations_count,
                        'toIdCount': to_relations_count
                    })
                    
                    # Logge Details der toId Relations für Debugging
                    if len(asset_relations_to) > 0:
                        for idx, to_rel in enumerate(asset_relations_to):
                            to_asset_id_in_rel = to_rel.get('to', {}).get('id')
                            from_asset_id = to_rel.get('from', {}).get('id')
                            from_asset_name = to_rel.get('from', {}).get('name', 'Unknown')
                            rel_type = to_rel.get('type', 'Unknown')
                            log_info(f"  toId relation {idx+1} for {asset_name}: to={to_asset_id_in_rel}, from={from_asset_id} ({from_asset_name}), type={rel_type}", {
                                'sessionId': session_id,
                                'assetId': asset_id,
                                'toAssetId': to_asset_id_in_rel,
                                'fromAssetId': from_asset_id,
                                'fromAssetName': from_asset_name,
                                'relationType': rel_type
                            })
                
                # Kombiniere fromId und toId Relations
                # fromId Relations: Asset ist Parent (hat Children) - bereits im richtigen Format
                # toId Relations: Asset ist Child (hat Parent) - müssen NICHT umgedreht werden, 
                #                 sondern direkt verwendet werden (from=Parent, to=Child=Asset)
                combined_asset_relations = list(asset_relations_from)
                
                # Füge toId Relations hinzu (bereits im richtigen Format: from=Parent, to=Child)
                # Die toId-Query gibt ALLE Relations zurück, bei denen toId das Asset ist
                # Wir müssen filtern, um nur die zu behalten, wo das Asset wirklich das 'to' ist
                for to_relation in asset_relations_to:
                    # Prüfe zuerst, ob das to-Asset wirklich das aktuelle Asset ist
                    to_asset_id = to_relation.get('to', {}).get('id')
                    if to_asset_id != asset_id:
                        # Diese Relation gehört nicht zu diesem Asset, überspringe
                        continue
                    
                    # Jetzt prüfe, ob es eine Asset-zu-Asset Contains-Relation ist
                    if to_relation.get('from', {}).get('entityType') == 'ASSET' and to_relation.get('type') == 'Contains':
                        combined_asset_relations.append(to_relation)
                        log_info(f"Found parent relation for {asset_name} via toId query", {
                            'sessionId': session_id,
                            'assetId': asset_id,
                            'parentId': to_relation.get('from', {}).get('id'),
                            'parentName': to_relation.get('from', {}).get('name', 'Unknown')
                        })
                
                # Filtere nur Device-Entities
                device_relations = [r for r in device_relations if r.get('to', {}).get('entityType') == 'DEVICE']
                
                # Sammle Device-IDs
                for relation in device_relations:
                    device_id = relation.get('to', {}).get('id')
                    if device_id:
                        all_device_ids.add(device_id)
                
                relations_results.append({
                    'asset': asset,
                    'assetRelations': combined_asset_relations,
                    'deviceRelations': device_relations
                })
            
            log_info(f"Found {len(all_device_ids)} unique device IDs", {'sessionId': session_id})
            
            # 4. Hole Device-Details
            device_details_map = {}
            if all_device_ids:
                log_info(f"Fetching details for {len(all_device_ids)} devices", {'sessionId': session_id})
                device_tasks = []
                for device_id in all_device_ids:
                    device_url = f"{THINGSBOARD_URL}/api/device/{device_id}"
                    task = fetch_with_timeout(session, device_url, headers, DEVICE_DETAILS_TIMEOUT)
                    device_tasks.append((device_id, task))
                
                for device_id, task in device_tasks:
                    device = await task
                    if device and device.get('id'):
                        device_details_map[device_id] = device
                
                log_info(f"Device details received: {len(device_details_map)} successful", {
                    'sessionId': session_id,
                    'successful': len(device_details_map)
                })
            
            # 5. Hole Asset-Attribute
            log_info(f"Fetching attributes for {len(assets)} assets", {'sessionId': session_id})
            attribute_tasks = []
            for asset in assets:
                task = fetch_asset_attributes(session, asset['id']['id'], tb_token, session_id)
                attribute_tasks.append((asset, task))
            
            attributes_success = 0
            attributes_failed = 0
            for asset, task in attribute_tasks:
                attributes = await task
                asset_id = asset['id']['id']
                asset_in_map = asset_map.get(asset_id)
                
                if attributes and len(attributes) > 0:
                    for key, value in attributes.items():
                        if asset_in_map:
                            asset_in_map[key] = value
                    attributes_success += 1
                else:
                    attributes_failed += 1
            
            log_info(f"Asset attributes processed: {attributes_success} successful, {attributes_failed} failed", {
                'sessionId': session_id,
                'successful': attributes_success,
                'failed': attributes_failed
            })
            
            # 6. Verarbeite Relations
            for result in relations_results:
                asset = result['asset']
                asset_id = asset['id']['id']
                asset_in_map = asset_map.get(asset_id)
                
                if not asset_in_map:
                    continue
                
                asset_relations = result['assetRelations']
                device_relations = result['deviceRelations']
                
                log_info(f"Processing asset {asset['name']}", {
                    'sessionId': session_id,
                    'assetId': asset_id,
                    'deviceRelationsCount': len(device_relations),
                    'assetRelationsCount': len(asset_relations)
                })
                
                # Setze Devices
                if device_relations:
                    asset_in_map['hasDevices'] = True
                    asset_in_map['relatedDevices'] = []
                    for relation in device_relations:
                        device_id = relation.get('to', {}).get('id')
                        device_details = device_details_map.get(device_id)
                        asset_in_map['relatedDevices'].append({
                            'id': device_id,
                            'name': device_details.get('name', 'Unbekannt') if device_details else 'Unbekannt',
                            'type': device_details.get('type', 'Unbekannt') if device_details else 'Unbekannt',
                            'label': device_details.get('label', 'Unbekannt') if device_details else 'Unbekannt'
                        })
                    log_info(f"Asset {asset['name']} has {len(asset_in_map['relatedDevices'])} devices", {
                        'sessionId': session_id,
                        'assetId': asset_id,
                        'deviceCount': len(asset_in_map['relatedDevices'])
                    })
                else:
                    asset_in_map['hasDevices'] = False
                    asset_in_map['relatedDevices'] = []
                
                # Verarbeite Asset-Relations
                for relation in asset_relations:
                    if relation.get('to', {}).get('entityType') == 'ASSET' and relation.get('type') == 'Contains':
                        parent_id = relation.get('from', {}).get('id')
                        child_id = relation.get('to', {}).get('id')
                        
                        parent_asset = asset_map.get(parent_id)
                        child_asset = asset_map.get(child_id)
                        
                        if parent_asset and child_asset:
                            # Prüfe auf bestehenden Parent
                            if child_asset['parentId'] and child_asset['parentId'] != parent_id:
                                log_warn(f"Asset {child_asset['name']} hat bereits einen Parent, überspringe", {
                                    'sessionId': session_id,
                                    'childAssetId': child_id,
                                    'existingParentId': child_asset['parentId'],
                                    'newParentId': parent_id
                                })
                                continue
                            
                            # Prüfe auf Duplikat
                            if any(c['id'] == child_id for c in parent_asset['children']):
                                log_warn(f"Asset {child_asset['name']} ist bereits ein Child", {
                                    'sessionId': session_id,
                                    'childAssetId': child_id,
                                    'parentId': parent_id
                                })
                                continue
                            
                            # Setze Parent-Child-Beziehung
                            child_asset['parentId'] = parent_id
                            parent_asset['children'].append(child_asset)
                            
                            log_info(f"Asset-Beziehung erstellt: {parent_asset['name']} enthält {child_asset['name']}", {
                                'sessionId': session_id,
                                'parentId': parent_id,
                                'childId': child_id
                            })
            
            # 7. Baue Tree aus Root-Assets
            root_assets = [asset for asset in asset_map.values() if not asset['parentId']]
            log_info(f"Building tree from {len(root_assets)} root assets", {'sessionId': session_id})
            
            assets_with_children = [a for a in asset_map.values() if len(a['children']) > 0]
            assets_with_parent = [a for a in asset_map.values() if a['parentId']]
            
            log_info(f"Assets mit Children: {len(assets_with_children)}", {'sessionId': session_id})
            log_info(f"Assets mit Parent: {len(assets_with_parent)}", {'sessionId': session_id})
            
            tree = [build_sub_tree(asset, asset_map) for asset in root_assets]
            
            # Berechne verwaiste Assets
            orphaned_assets = [a for a in asset_map.values() 
                             if not a['parentId'] and a not in root_assets]
            
            summary = {
                'totalAssets': len(assets),
                'rootAssets': len(root_assets),
                'totalDevices': len(all_device_ids),
                'devicesWithDetails': len(device_details_map),
                'attributesSuccessful': attributes_success,
                'attributesFailed': attributes_failed,
                'assetsWithChildren': len(assets_with_children),
                'assetsWithParent': len(assets_with_parent),
                'orphanedAssets': len(orphaned_assets)
            }
            
            end_structure_creation_log(session_id, summary)
            log_info("Tree structure created successfully", {'sessionId': session_id, 'summary': summary})
            
            if summary['orphanedAssets'] > 0:
                log_warn(f"Warnung: {summary['orphanedAssets']} verwaiste Assets gefunden", {
                    'sessionId': session_id,
                    'orphanedCount': summary['orphanedAssets']
                })
            
            return tree
            
    except Exception as e:
        log_error('Error fetching asset tree', e)
        end_structure_creation_log(session_id, {'error': str(e)})
        raise

def save_tree_to_db(customer_id: str, tree: List[Dict]):
    """Speichert den Tree in die customer_settings Tabelle"""
    try:
        log_info(f"Starting to save tree to database for customer {customer_id}")
        log_info(f"Tree has {len(tree)} root nodes")
        
        # Konvertiere Tree zu JSON
        tree_json = json.dumps(tree, ensure_ascii=False)
        tree_size = len(tree_json)
        log_info(f"Tree JSON size: {tree_size} characters")
        
        if tree_size > 1000000:  # > 1MB
            log_warn(f"Tree JSON is very large: {tree_size} characters")
        
        conn = get_db_connection()
        log_info("Database connection established")
        
        cursor = conn.cursor()
        
        # Prüfe ob Eintrag existiert
        cursor.execute("""
            SELECT customer_id, LEN(CAST(tree AS NVARCHAR(MAX))) as tree_length
            FROM customer_settings 
            WHERE customer_id = ?
        """, (customer_id,))
        
        existing_row = cursor.fetchone()
        if existing_row:
            log_info(f"Existing entry found for customer {customer_id}, tree length: {existing_row[1] if existing_row[1] else 0}")
        else:
            log_info(f"No existing entry found for customer {customer_id}, will INSERT")
        
        # Versuche UPDATE mit explizitem NVARCHAR(MAX) Cast
        log_info("Attempting UPDATE...")
        cursor.execute("""
            UPDATE customer_settings 
            SET tree = CAST(? AS NVARCHAR(MAX)), tree_updated = GETDATE()
            WHERE customer_id = ?
        """, (tree_json, customer_id))
        
        rows_updated = cursor.rowcount
        log_info(f"UPDATE affected {rows_updated} rows")
        
        if rows_updated == 0:
            # INSERT wenn kein Eintrag existiert
            log_info("No rows updated, attempting INSERT...")
            cursor.execute("""
                INSERT INTO customer_settings (customer_id, tree, tree_updated)
                VALUES (?, CAST(? AS NVARCHAR(MAX)), GETDATE())
            """, (customer_id, tree_json))
            log_info("INSERT executed successfully")
        else:
            log_info("UPDATE executed successfully")
        
        conn.commit()
        log_info("Transaction committed")
        
        # Verifiziere das Speichern
        cursor.execute("""
            SELECT LEN(CAST(tree AS NVARCHAR(MAX))) as tree_length
            FROM customer_settings 
            WHERE customer_id = ?
        """, (customer_id,))
        
        verify_row = cursor.fetchone()
        if verify_row:
            saved_length = verify_row[0] if verify_row[0] else 0
            log_info(f"Verification: Saved tree length is {saved_length} characters")
            if saved_length != tree_size:
                log_warn(f"Size mismatch: original {tree_size}, saved {saved_length}")
        
        cursor.close()
        conn.close()
        log_info("Database connection closed")
        
        log_info(f"Tree saved to database successfully for customer {customer_id}")
        return True
        
    except Exception as e:
        log_error(f"Error saving tree to database: {e}", e)
        import traceback
        log_error(f"Traceback: {traceback.format_exc()}")
        raise

def log_print(message: str, level: str = "INFO"):
    """Schreibt eine Nachricht sowohl in die Log-Datei als auch nach stdout"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [{level}] {message}\n"
    write_to_log_file(SCRIPT_LOG_FILE, log_entry)
    print(message)

async def main():
    """Hauptfunktion"""
    parser = argparse.ArgumentParser(description='Synchronisiert die Asset-Struktur von ThingsBoard')
    parser.add_argument('customer_id', help='Customer ID (UUID)')
    args = parser.parse_args()
    
    customer_id = args.customer_id
    
    # Start-Log
    log_print("=" * 80, "START")
    log_print(f"Starting structure sync for customer: {customer_id}", "START")
    log_print(f"ThingsBoard URL: {THINGSBOARD_URL}", "INFO")
    log_print(f"Log directory: {os.path.abspath(LOG_DIR)}", "INFO")
    log_print("=" * 80, "START")
    
    try:
        # Validiere Customer ID Format
        uuid.UUID(customer_id)
    except ValueError:
        error_msg = f"ERROR: Invalid customer_id format: {customer_id}"
        log_print(error_msg, "ERROR")
        log_print("Customer ID must be a valid UUID", "ERROR")
        sys.exit(1)
    
    try:
        # Hole ThingsBoard Token
        log_print("Getting ThingsBoard token...", "INFO")
        tb_token = get_thingsboard_token(customer_id)
        log_print("Token obtained successfully", "INFO")
        
        # Hole und baue Tree
        log_print("Fetching asset tree...", "INFO")
        tree = await fetch_asset_tree(customer_id, tb_token)
        log_print(f"Tree built with {len(tree)} root assets", "INFO")
        
        # Speichere in DB
        log_print("Saving tree to database...", "INFO")
        save_tree_to_db(customer_id, tree)
        log_print("Tree saved successfully", "INFO")
        
        log_print("=" * 80, "SUCCESS")
        log_print("Structure sync completed successfully!", "SUCCESS")
        log_print("=" * 80, "SUCCESS")
        return 0
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        log_print("=" * 80, "ERROR")
        log_print(f"Error: {e}", "ERROR")
        log_print("Traceback:", "ERROR")
        for line in error_trace.split('\n'):
            if line.strip():
                log_print(f"  {line}", "ERROR")
        log_print("=" * 80, "ERROR")
        return 1

if __name__ == "__main__":
    # Prüfe Umgebungsvariablen
    if not all([MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD]):
        print("ERROR: Missing required environment variables:")
        print("  - MSSQL_SERVER")
        print("  - MSSQL_DATABASE")
        print("  - MSSQL_USER")
        print("  - MSSQL_PASSWORD")
        print("\nOptional:")
        print("  - THINGSBOARD_URL (default: https://thingsboard.heatmanager.de)")
        print("  - THINGSBOARD_TOKEN (fallback if not in DB)")
        sys.exit(1)
    
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

