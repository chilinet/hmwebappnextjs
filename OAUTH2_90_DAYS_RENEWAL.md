# OAuth2 Token-Erneuerung nach 90 Tagen

## ⏰ **Was passiert in 90 Tagen?**

### **Refresh Token läuft ab:**
- **Gültigkeitsdauer**: 90 Tage (Microsoft-Standard)
- **Symptom**: E-Mails funktionieren nicht mehr
- **Fehlermeldung**: "invalid_grant" oder "token expired"
- **Häufigkeit**: Alle 90 Tage

## 🔄 **Lösung: Refresh Token erneuern**

### **Option 1: Manuelle Erneuerung (einfachste Lösung)**

#### **Schritt 1: Neuen Authorization Code holen**
1. **Gehen Sie zu `/admin/email-test`**
2. **Klicken Sie auf "OAuth2-URL generieren"**
3. **URL öffnet sich in einem neuen Tab**
4. **Melden Sie sich an und autorisieren Sie die App**
5. **Kopieren Sie den neuen "code" Parameter**

#### **Schritt 2: Erste Authentifizierung**
1. **Setzen Sie den neuen Code in `.env`:**
   ```bash
   OAUTH_AUTHORIZATION_CODE=ihr_neuer_code_hier
   ```

2. **Starten Sie die App neu:**
   ```bash
   npm run dev
   ```

3. **Senden Sie eine Test-E-Mail:**
   ```bash
   node test-simple-oauth2-only.js
   ```

4. **Kopieren Sie den neuen Refresh Token** aus den Server-Logs

#### **Schritt 3: Neuen Refresh Token speichern**
1. **Aktualisieren Sie `.env`:**
   ```bash
   OAUTH_REFRESH_TOKEN=ihr_neuer_refresh_token_hier
   ```

2. **Entfernen Sie den Authorization Code:**
   ```bash
   # OAUTH_AUTHORIZATION_CODE=...  # Diese Zeile entfernen
   ```

3. **App neu starten:**
   ```bash
   npm run dev
   ```

### **Option 2: Automatische Erneuerung (fortgeschritten)**

#### **Schritt 1: Token-Status prüfen**
```bash
# Über die API prüfen
curl -X POST http://localhost:3000/api/email/refresh-oauth2-token \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=ihr_token"
```

#### **Schritt 2: Token automatisch erneuern**
Die API wird automatisch prüfen, ob ein neuer Refresh Token benötigt wird.

## 📅 **90-Tage-Zyklus verwalten**

### **Kalender-Erinnerungen einrichten:**

#### **Option A: Google Calendar**
- **Erinnerung**: "OAuth2 Token erneuern"
- **Datum**: 90 Tage nach dem letzten Setup
- **Wiederholung**: Alle 90 Tage

#### **Option B: Outlook Calendar**
- **Erinnerung**: "OAuth2 Token erneuern"
- **Datum**: 90 Tage nach dem letzten Setup
- **Wiederholung**: Alle 90 Tage

#### **Option C: Smartphone-Erinnerung**
- **App**: Kalender-App
- **Erinnerung**: "OAuth2 Token erneuern"
- **Wiederholung**: Alle 90 Tage

### **Option D: Automatische Überwachung (empfohlen)**

Ich kann Ihnen eine **automatische Überwachung** implementieren, die Sie 7 Tage vor dem Ablauf warnt:

## 🔧 **Automatische Überwachung implementieren**

### **Schritt 1: Token-Überwachung aktivieren**
```bash
# In .env hinzufügen
OAUTH_TOKEN_MONITORING=true
OAUTH_TOKEN_WARNING_DAYS=7
```

### **Schritt 2: Überwachung testen**
```bash
# Token-Status prüfen
curl -X POST http://localhost:3000/api/email/check-oauth2-token-status
```

## 📋 **Vollständiger 90-Tage-Zyklus**

### **Tag 1: Setup**
- ✅ Authorization Code holen
- ✅ Refresh Token erhalten
- ✅ E-Mail-Funktionalität testen

### **Tag 30: Erste Überprüfung**
- ✅ Token-Status prüfen
- ✅ E-Mail-Funktionalität testen

### **Tag 60: Zweite Überprüfung**
- ✅ Token-Status prüfen
- ✅ E-Mail-Funktionalität testen

### **Tag 83: Warnung (7 Tage vor Ablauf)**
- ⚠️ Token läuft bald ab
- 📧 E-Mail-Benachrichtigung
- 🔄 Erneuerung vorbereiten

### **Tag 90: Token läuft ab**
- ❌ E-Mails funktionieren nicht mehr
- 🔄 Sofortige Erneuerung nötig

## 🚨 **Notfall-Erneuerung**

### **Wenn der Token bereits abgelaufen ist:**

1. **Sofort neuen Authorization Code holen**
2. **Neuen Refresh Token erhalten**
3. **E-Mail-Funktionalität wiederherstellen**

### **Zeitaufwand:**
- **Erste Erneuerung**: 15-20 Minuten
- **Spätere Erneuerungen**: 5-10 Minuten
- **Häufigkeit**: Alle 90 Tage

## 💡 **Tipps für die 90-Tage-Erneuerung:**

### **Vorbereitung:**
- **Kalender-Erinnerung einrichten**
- **Dokumentation aktuell halten**
- **Backup der aktuellen Konfiguration**

### **Während der Erneuerung:**
- **Test-E-Mail senden**
- **Funktionalität überprüfen**
- **Neue Token dokumentieren**

### **Nach der Erneuerung:**
- **Alte Token entfernen**
- **Konfiguration aktualisieren**
- **Nächste Erneuerung planen**

## 🎯 **Zusammenfassung:**

**Alle 90 Tage müssen Sie:**
1. **Neuen Authorization Code holen**
2. **Neuen Refresh Token erhalten**
3. **Konfiguration aktualisieren**
4. **Nächste Erneuerung planen**

**Mit der automatischen Überwachung werden Sie rechtzeitig gewarnt!** ⏰✨

## 📞 **Support:**

Bei Problemen:
1. **Überprüfen Sie die Server-Logs**
2. **Testen Sie die Token-Erneuerung**
3. **Kontaktieren Sie den Support**

**Die 90-Tage-Erneuerung ist normal und Teil des OAuth2-Flows!** 🔄✨
