# Lern-Match

Tägliches Lern-Match mit Mathe, Englisch-Vokabeln und Deutsch-Rechtschreibung für die 5. Klasse – im Tennis-Look mit den Bällen Ace und Lobbi nach Philips Zeichnungen. Mit jedem Match wächst der Tennisplatz.

- Neue Vokabeln, Aufgaben und Tennis-Fragen stehen in `inhalte.js`. Neue Wörter nur hinten an eine Unit anhängen, nie umsortieren oder löschen – der Lernstand hängt an der Position.
- Vokabeln: Neue Wörter kommen aus der im Eltern-Tab gewählten Unit, dazwischen abwechselnd Wörter aus früheren Units und Tennis-Englisch. Sichere Wörter (Stufe 5) kommen nach 2 Wochen, 1 und 2 Monaten zum Auffrischen wieder, 1–2 pro Match.
- Läuft im Browser und lässt sich in Chrome über „App installieren“ auf den Startbildschirm legen.
- Der Lernstand liegt zuerst auf dem Gerät. Wer sich im Eltern-Tab anmeldet, gleicht ihn mit dem Familienspeicher (Supabase, Frankfurt) ab; der neuere Stand gewinnt. Eltern sehen dort Philips Wochenbericht. Die Anbindung steckt in `familie-sync.js` und wird auch von den anderen Apps genutzt.
- Ohne Anmeldung bleibt alles nur auf dem Gerät. Beim ersten Start wird der Lernstand aus Fenneks Lern-Oase übernommen, wenn beide unter derselben GitHub-Pages-Adresse laufen.

## Tie-Break (Rechtschreibung im freien Schreiben)

- Nach dem Match schreibt Philip ein paar Sätze zum Thema des Tages (Mo Bio, Di Erdkunde, Mi Mathe-Textaufgabe, Do Tennis, Fr Detektiv, Wochenende frei). Themen und Schreibanlässe stehen in `inhalte.js` unter `tiebreak`.
- Die Edge Function `tiebreak-check` (Quelle in `supabase/functions/tiebreak-check/`) findet Rechtschreibfehler, verrät sie aber nicht. Philip tippt das falsche Wort selbst an und verbessert es; es gibt zwei Tipps und zuletzt die Lösung.
- Die Prüfung braucht die Anmeldung im Eltern-Tab. Der KI-Schlüssel liegt als Secret `ANTHROPIC_API_KEY` in Supabase, nie im Code. Pro Mitglied sind 25 Prüfungen am Tag möglich.
- `tiebreak.fokus` in `inhalte.js` begrenzt die Prüfung auf bestimmte Fehlerarten (z. B. `["gross","doppel"]`), sobald das Fehlerprofil steht.
- Die Texte, gefundenen Fehler und die häufigsten Fehlerarten stehen im Wochenbericht im Eltern-Tab.
- `familie-sync.js` hat dafür die neue Funktion `fn()` bekommen. In den anderen Repos kann die Datei bei Gelegenheit nachgezogen werden.
