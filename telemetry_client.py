#!/usr/bin/env python3
"""
Telemetrie-API Client für HEATMANAGER
Ruft Telemetriedaten von der lokalen API ab
"""

import requests
import json
import sys
import os
from datetime import datetime, timedelta
import argparse
from typing import Optional, Dict, Any

class TelemetryClient:
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.auth_token = None
        
    def login(self, username: str, password: str) -> bool:
        """
        Anmeldung über NextAuth
        """
        try:
            login_url = f"{self.base_url}/api/auth/signin"
            
            # NextAuth Login-Daten
            login_data = {
                "username": username,
                "password": password,
                "callbackUrl": f"{self.base_url}/dashboard",
                "redirect": False
            }
            
            print(f"Versuche Anmeldung bei {self.base_url}...")
            
            # POST-Anfrage für Login
            response = self.session.post(login_url, json=login_data)
            
            if response.status_code == 200:
                print("✅ Anmeldung erfolgreich!")
                
                # Versuche den Auth-Token aus der Session zu extrahieren
                # Da NextAuth komplex ist, versuchen wir einen alternativen Weg
                return self._get_auth_token()
            else:
                print(f"❌ Anmeldung fehlgeschlagen: {response.status_code}")
                print(f"Antwort: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Fehler bei der Anmeldung: {e}")
            return False
    
    def _get_auth_token(self) -> bool:
        """
        Versucht einen Auth-Token zu erhalten
        """
        try:
            # Versuche den Token über die Session-API zu erhalten
            session_url = f"{self.base_url}/api/auth/session"
            response = self.session.get(session_url)
            
            if response.status_code == 200:
                session_data = response.json()
                if session_data and 'accessToken' in session_data:
                    self.auth_token = session_data['accessToken']
                    print("✅ Auth-Token erfolgreich erhalten")
                    return True
                else:
                    print("⚠️  Kein Access-Token in der Session gefunden")
                    print(f"Session-Daten: {json.dumps(session_data, indent=2)}")
                    return False
            else:
                print(f"⚠️  Konnte Session nicht abrufen: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"⚠️  Fehler beim Abrufen des Auth-Tokens: {e}")
            return False
    
    def get_telemetry(self, device_id: str, keys: Optional[str] = None, 
                      start_ts: Optional[int] = None, end_ts: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Ruft Telemetriedaten für ein Gerät ab
        """
        if not self.auth_token:
            print("❌ Kein Auth-Token verfügbar. Bitte zuerst anmelden.")
            return None
        
        try:
            # Standard-Keys falls keine angegeben
            if not keys:
                keys = "fCnt,sensorTemperature,targetTemperature,batteryVoltage,PercentValveOpen,rssi,snr,sf,signalQuality"
            
            # API-Endpunkt
            url = f"{self.base_url}/api/thingsboard/devices/telemetry"
            
            # Query-Parameter
            params = {
                "deviceId": device_id,
                "keys": keys
            }
            
            # Zeitbereich hinzufügen falls angegeben
            if start_ts:
                params["startTs"] = start_ts
            if end_ts:
                params["endTs"] = end_ts
            
            # Headers
            headers = {
                "Authorization": f"Bearer {self.auth_token}",
                "Content-Type": "application/json"
            }
            
            print(f"📡 Rufe Telemetriedaten für Device {device_id} ab...")
            print(f"URL: {url}")
            print(f"Parameter: {params}")
            
            # API-Aufruf
            response = self.session.get(url, params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                print("✅ Telemetriedaten erfolgreich abgerufen!")
                return data
            else:
                print(f"❌ Fehler beim Abrufen der Telemetriedaten: {response.status_code}")
                print(f"Antwort: {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Fehler beim API-Aufruf: {e}")
            return None
    
    def format_telemetry_data(self, data: Dict[str, Any]) -> str:
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
                
                # Zeige die letzten 5 Werte
                recent_values = values[-5:] if len(values) > 5 else values
                
                for i, value_data in enumerate(recent_values):
                    if isinstance(value_data, dict) and 'ts' in value_data and 'value' in value_data:
                        timestamp = datetime.fromtimestamp(value_data['ts'] / 1000).strftime('%Y-%m-%d %H:%M:%S')
                        value = value_data['value']
                        
                        # Formatierung je nach Datentyp
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
                
                # Zusammenfassung
                total_values = len(values)
                if total_values > 5:
                    result.append(f"   ... und {total_values - 5} weitere Werte")
            else:
                result.append(f"\n🔹 {key}: {values}")
        
        return "\n".join(result)
    
    def get_current_time_range(self, hours: int = 24) -> tuple:
        """
        Berechnet den aktuellen Zeitbereich
        """
        end_time = int(datetime.now().timestamp() * 1000)
        start_time = int((datetime.now() - timedelta(hours=hours)).timestamp() * 1000)
        return start_time, end_time

def main():
    parser = argparse.ArgumentParser(description="HEATMANAGER Telemetrie-API Client")
    parser.add_argument("--url", default="http://localhost:3000", 
                       help="Base URL der API (Standard: http://localhost:3000)")
    parser.add_argument("--username", required=True, help="Benutzername für die Anmeldung")
    parser.add_argument("--password", required=True, help="Passwort für die Anmeldung")
    parser.add_argument("--device-id", required=True, help="Device ID für Telemetriedaten")
    parser.add_argument("--keys", help="Komma-getrennte Liste der Telemetrie-Keys")
    parser.add_argument("--hours", type=int, default=24, 
                       help="Anzahl der Stunden für den Zeitbereich (Standard: 24)")
    parser.add_argument("--raw", action="store_true", 
                       help="Rohe JSON-Ausgabe")
    
    args = parser.parse_args()
    
    # Client erstellen
    client = TelemetryClient(args.url)
    
    # Anmelden
    if not client.login(args.username, args.password):
        print("❌ Anmeldung fehlgeschlagen. Beende Programm.")
        sys.exit(1)
    
    # Zeitbereich berechnen
    start_ts, end_ts = client.get_current_time_range(args.hours)
    
    # Telemetriedaten abrufen
    telemetry_data = client.get_telemetry(
        device_id=args.device_id,
        keys=args.keys,
        start_ts=start_ts,
        end_ts=end_ts
    )
    
    if telemetry_data:
        if args.raw:
            # Rohe JSON-Ausgabe
            print(json.dumps(telemetry_data, indent=2, ensure_ascii=False))
        else:
            # Formatierte Ausgabe
            print(client.format_telemetry_data(telemetry_data))
    else:
        print("❌ Konnte keine Telemetriedaten abrufen.")
        sys.exit(1)

if __name__ == "__main__":
    main()
