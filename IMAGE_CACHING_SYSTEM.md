# Bildcaching-System für Dashboard

## Übersicht

Das Dashboard wurde um ein intelligentes Bildcaching-System erweitert, das die Performance beim Laden und Anzeigen von Bildern deutlich verbessert. Bilder werden lokal im Browser gecacht und bei wiederholten Zugriffen sofort angezeigt.

## Funktionalitäten

### ✅ **Automatisches Caching**
- Bilder werden automatisch im Hintergrund gecacht, wenn ein Node mit Bildern ausgewählt wird
- Gecachte Bilder werden als Data URLs im Browser-Speicher gespeichert
- Optimierte Bildqualität (80% JPEG) für kleinere Speichergröße

### ✅ **Intelligente Anzeige**
- Sofortige Anzeige gecachter Bilder
- Loading-Indikatoren für noch nicht gecachte Bilder
- Fallback zur ursprünglichen URL bei Fehlern

### ✅ **Speicher-Management**
- Automatisches Leeren des Caches beim Wechseln zu einem anderen Node
- Manueller Cache-Clear-Button
- Cache-Status-Anzeige

### ✅ **Performance-Optimierungen**
- Paralleles Laden mehrerer Bilder
- CORS-Unterstützung für externe Bilder
- Fehlerbehandlung mit Fallback-Mechanismen

## Implementierung

### State Management
```javascript
// Image cache state
const [imageCache, setImageCache] = useState(new Map());
const [imageLoadingStates, setImageLoadingStates] = useState(new Map());
```

### Kernfunktionen

#### 1. `cacheImage(imageUrl, imageId)`
Cacht ein einzelnes Bild und konvertiert es zu einer Data URL.

#### 2. `getCachedImage(imageUrl, imageId)`
Gibt das gecachte Bild zurück oder die ursprüngliche URL als Fallback.

#### 3. `preloadImages(imagesList)`
Lädt alle Bilder einer Liste parallel im Hintergrund.

#### 4. `clearImageCache()`
Leert den gesamten Bildcache.

#### 5. `getCacheStats()`
Gibt Statistiken über den Cache-Status zurück.

### Integration in die UI

#### Bildanzeige mit Loading-Status
```javascript
{isImageLoading ? (
  <div className="loading-placeholder">
    <div className="spinner-border" />
    <div>Lade Bild...</div>
  </div>
) : (
  <img
    src={cachedImageUrl}
    alt={image.filename}
    onError={(e) => {
      if (e.target.src !== image.imageUrl) {
        e.target.src = image.imageUrl;
      }
    }}
  />
)}
```

#### Cache-Status-Anzeige
```javascript
<span className="badge bg-info" title={`${stats.cachedImages} gecacht, ${stats.loadingImages} laden`}>
  {stats.cachedImages}/{stats.totalImages} gecacht
</span>
```

## Vorteile

### 🚀 **Performance**
- **Sofortige Anzeige**: Gecachte Bilder werden sofort angezeigt
- **Reduzierte Latenz**: Keine Netzwerk-Anfragen für gecachte Bilder
- **Paralleles Laden**: Mehrere Bilder werden gleichzeitig gecacht

### 💾 **Speicher-Effizienz**
- **Automatisches Cleanup**: Cache wird beim Node-Wechsel geleert
- **Optimierte Größe**: 80% JPEG-Qualität reduziert Speicherverbrauch
- **Manueller Control**: Benutzer kann Cache manuell leeren

### 🛡️ **Robustheit**
- **Fehlerbehandlung**: Fallback zur ursprünglichen URL bei Problemen
- **CORS-Support**: Unterstützung für externe Bilder
- **Loading-States**: Benutzerfreundliche Loading-Indikatoren

## Cache-Lebenszyklus

1. **Node-Auswahl**: Cache wird geleert, neue Bilder werden geladen
2. **Bildladen**: Bilder werden parallel im Hintergrund gecacht
3. **Anzeige**: Gecachte Bilder werden sofort angezeigt
4. **Node-Wechsel**: Cache wird automatisch geleert

## Benutzer-Interface

### Cache-Status-Badge
- Zeigt Anzahl gecachter Bilder an
- Tooltip mit detaillierten Informationen
- Automatische Aktualisierung

### Cache-Management-Buttons
- **"Neu laden"**: Lädt Bilder und Cache neu
- **"Cache leeren"**: Leert den aktuellen Cache
- Nur sichtbar wenn Cache vorhanden ist

## Technische Details

### Canvas-basierte Konvertierung
```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = img.width;
canvas.height = img.height;
ctx.drawImage(img, 0, 0);
const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
```

### Fehlerbehandlung
```javascript
img.onerror = (error) => {
  console.error('Error loading image:', error);
  setImageLoadingStates(prev => new Map(prev.set(imageId, false)));
  reject(error);
};
```

### CORS-Unterstützung
```javascript
const img = new Image();
img.crossOrigin = 'anonymous';
```

## Monitoring

### Console-Logs
- Cache-Start: `Starting to preload X images for asset Y`
- Cache-Ende: `Finished preloading images for asset Y`
- Cache-Clear: `Image cache cleared`

### Cache-Statistiken
- `cachedImages`: Anzahl gecachter Bilder
- `loadingImages`: Anzahl gerade ladender Bilder
- `totalImages`: Gesamtanzahl verfügbarer Bilder

## Browser-Kompatibilität

- **Moderne Browser**: Vollständige Unterstützung
- **Canvas API**: Für Bildkonvertierung erforderlich
- **Map API**: Für Cache-Speicherung
- **CORS**: Für externe Bilder

## Zukünftige Erweiterungen

### Mögliche Verbesserungen
- **Persistent Cache**: Cache über Browser-Sessions hinweg
- **Cache-Größen-Limit**: Automatisches Entfernen alter Bilder
- **Progressive Loading**: Bilder in verschiedenen Qualitätsstufen
- **WebP-Support**: Moderne Bildformate für bessere Kompression
- **Service Worker**: Offline-Caching für bessere Performance
