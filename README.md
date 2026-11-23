# Why Am I Opening This

Firefox-Erweiterung (Desktop und Android), die vor ausgewählten Websites nach dem Grund fragt, den Besuch auf ein Zeitbudget begrenzt und die Nutzungszeit erfasst.

## Funktionen

- **Zweistufiges Gate:** Vor dem Öffnen einer gewählten Website nennst du Grund und Zeitbudget, danach folgt eine kurze Atemübung.
- **Zeitbegrenzung:** Läuft das Budget ab, wird die Seite wieder gesperrt und der ursprüngliche Grund angezeigt.
- **Hinweise:** Ein Countdown in der Ecke 30 Sekunden vor Ablauf, außerdem eine Rückfrage bei Vielfachen eines gemeinsamen Tageslimits.
- **Dashboard:** Nutzungszeiten und angegebene Gründe pro Website.

## Datenschutz

Alle Daten (Seitenliste, Gründe, Nutzungszeiten) liegen ausschließlich in `storage.local` des Browsers. Die Erweiterung sendet nichts an externe Server und enthält keine Analyse- oder Tracking-Komponenten.

## Berechtigungen

| Berechtigung | Zweck |
|---|---|
| `storage` | Speichern von Einstellungen, Gründen und Nutzungszeiten |
| `idle` | Zeiterfassung nur bei aktiver Nutzung |
| `alarms` | Ablauf des Zeitbudgets und Countdown |
| `webRequest`, `webRequestBlocking` | Umleitung auf das Gate vor dem Laden einer gewählten Seite |
| `<all_urls>` | Die Seitenliste ist frei konfigurierbar, daher lässt sich der Host-Zugriff nicht vorab eingrenzen |

## Entwicklung

Ohne Build-Schritt. Zum Testen in Firefox `about:debugging` → „Dieser Firefox“ → „Temporäres Add-on laden“ und `manifest.json` wählen. Prüfung und Paket:

```
npx web-ext lint
npx web-ext build --ignore-files README.md LICENSE
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
