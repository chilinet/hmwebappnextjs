#!/usr/bin/env python3
"""
Direkter NextAuth-Client für HEATMANAGER
Simuliert den kompletten Login-Prozess
"""

import requests
import json
from datetime import datetime

def direct_login(username, password, base_url="http://localhost:3000"):
    """
    Direkter Login über NextAuth
    """
    session = requests.Session()
    
    print(f"🔐 Direkte Anmeldung bei {base_url}...")
    
    try:
        # 1. CSRF-Token abrufen (falls erforderlich)
        print("📡 Rufe CSRF-Token ab...")
        csrf_response = session.get(f"{base_url}/api/auth/csrf")
        
        if csrf_response.status_code == 200:
            csrf_data = csrf_response.json()
            csrf_token = csrf_data.get('csrfToken')
            print(f"✅ CSRF-Token erhalten: {csrf_token}")
        else:
            print("⚠️  CSRF-Token konnte nicht abgerufen werden, fahre ohne fort...")
            csrf_token = None
        
        # 2. Login-Daten vorbereiten
        login_data = {
            "username": username,
            "password": password,
            "callbackUrl": f"{base_url}/dashboard",
            "redirect": False
        }
        
        if csrf_token:
            login_data["csrfToken"] = csrf_token
        
        # 3. Login-Request senden
        print("📡 Sende Login-Request...")
        login_response = session.post(
            f"{base_url}/api/auth/callback/credentials",
            data=login_data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{base_url}/auth/signin"
            }
        )
        
        print(f"Login-Response Status: {login_response.status_code}")
        print(f"Login-Response Headers: {dict(login_response.headers)}")
        
        if login_response.status_code in [200, 302]:
            print("✅ Login-Request erfolgreich!")
            
            # 4. Session abrufen
            print("📡 Rufe Session ab...")
            session_response = session.get(f"{base_url}/api/auth/session")
            
            if session_response.status_code == 200:
                session_data = session_response.json()
                print(f"✅ Session abgerufen: {json.dumps(session_data, indent=2)}")
                return session_data, session
            else:
                print(f"❌ Session konnte nicht abgerufen werden: {session_response.status_code}")
                return None, session
        else:
            print(f"❌ Login fehlgeschlagen: {login_response.status_code}")
            print(f"Antwort: {login_response.text}")
            return None, session
            
    except Exception as e:
        print(f"❌ Fehler beim direkten Login: {e}")
        return None, session

def get_telemetry_with_session(device_id, session_data, session, base_url="http://localhost:3000"):
    """
    Ruft Telemetriedaten mit der bestehenden Session ab
    """
    try:
        # Token aus der Session extrahieren
        auth_token = None
        
        if session_data and 'token' in session_data:
            auth_token = session_data['token']
            print("✅ Token aus Session gefunden")
        elif session_data and 'accessToken' in session_data:
            auth_token = session_data['accessToken']
            print("✅ AccessToken aus Session gefunden")
        elif session_data and 'user' in session_data and 'token' in session_data['user']:
            auth_token = session_data['user']['token']
            print("✅ Token aus user.token gefunden")
        else:
            print("⚠️  Kein Token in der Session gefunden")
            print("Verfügbare Felder:", list(session_data.keys()) if session_data else "Keine Session-Daten")
            return None
        
        # Telemetriedaten abrufen
        print(f"📡 Rufe Telemetriedaten für Device {device_id} ab...")
        
        # Standard-Keys
        keys = "fCnt,sensorTemperature,targetTemperature,batteryVoltage,PercentValveOpen,rssi,snr,sf,signalQuality"
        
        # Zeitbereich: letzte 24 Stunden
        end_time = int(datetime.now().timestamp() * 1000)
        start_time = end_time - (24 * 60 * 60 * 1000)
        
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        params = {
            "deviceId": device_id,
            "keys": keys,
            "startTs": start_time,
            "endTs": end_time
        }
        
        print(f"URL: {base_url}/api/thingsboard/devices/telemetry")
        print(f"Parameter: {params}")
        print(f"Headers: {headers}")
        
        telemetry_response = session.get(
            f"{base_url}/api/thingsboard/devices/telemetry",
            params=params,
            headers=headers
        )
        
        if telemetry_response.status_code == 200:
            data = telemetry_response.json()
            print("✅ Telemetriedaten erfolgreich abgerufen!")
            return data
        else:
            print(f"❌ Fehler beim Abrufen der Telemetriedaten: {telemetry_response.status_code}")
            print(f"Antwort: {telemetry_response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Fehler beim API-Aufruf: {e}")
        return None

def format_data(data):
    """
    Formatiert die Telemetriedaten für die Anzeige
    """
    if not data:
        return "Keine Daten verfügbar"
    
    result = []
    result.append("📊 TELEMETRIEDATEN")
    result.append("=" * 50)
    
    for key, values in data.items():
        if isinstance(values, list) and values:
            result.append(f"\n🔹 {key}:")
            
            # Zeige die letzten 3 Werte
            recent_values = values[-3:] if len(values) > 3 else values
            
            for value_data in recent_values:
                if isinstance(value_data, dict) and 'ts' in value_data and 'value' in value_data:
                    timestamp = datetime.fromtimestamp(value_data['ts'] / 1000).strftime('%H:%M:%S')
                    value = value_data['value']
                    
                    # Formatierung
                    if key in ['sensorTemperature', 'targetTemperature']:
                        formatted_value = f"{value}°C"
                    elif key == 'batteryVoltage':
                        formatted_value = f"{value}V"
                    elif key == 'PercentValveOpen':
                        formatted_value = f"{value}%"
                    elif key in ['rssi']:
                        formatted_value = f"{value}dBm"
                    elif key in ['snr']:
                        formatted_value = f"{value}dB"
                    else:
                        formatted_value = str(value)
                    
                    result.append(f"   {timestamp}: {formatted_value}")
            
            total_values = len(values)
            if total_values > 3:
                result.append(f"   ... und {total_values - 3} weitere Werte")
        else:
            result.append(f"\n🔹 {key}: {values}")
    
    return "\n".join(result)

if __name__ == "__main__":
    print("🚀 HEATMANAGER Direkter NextAuth-Client")
    print("=" * 50)
    
    # Konfiguration
    DEVICE_ID = input("Device ID eingeben: ").strip()
    USERNAME = input("Benutzername eingeben: ").strip()
    PASSWORD = input("Passwort eingeben: ").strip()
    BASE_URL = input("Base URL (Standard: http://localhost:3000): ").strip() or "http://localhost:3000"
    
    print("\n" + "=" * 50)
    
    # Direkter Login
    session_data, session = direct_login(USERNAME, PASSWORD, BASE_URL)
    
    if session_data:
        # Telemetriedaten abrufen
        telemetry_data = get_telemetry_with_session(DEVICE_ID, session_data, session, BASE_URL)
        
        if telemetry_data:
            print("\n" + format_data(telemetry_data))
            
            # Option: Rohe Daten speichern
            save_raw = input("\nRohe JSON-Daten in Datei speichern? (j/n): ").strip().lower()
            if save_raw in ['j', 'ja', 'y', 'yes']:
                filename = f"telemetry_{DEVICE_ID}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(telemetry_data, f, indent=2, ensure_ascii=False)
                print(f"✅ Daten gespeichert in: {filename}")
        else:
            print("❌ Konnte keine Telemetriedaten abrufen.")
    else:
        print("❌ Login fehlgeschlagen.")
