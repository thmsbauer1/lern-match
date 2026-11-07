# Lern-Match

Tägliches Lern-Match mit Mathe, Englisch-Vokabeln und Deutsch-Rechtschreibung für die 5. Klasse – im Tennis-Look mit den Bällen Ace und Lobbi nach Philips Zeichnungen. Mit jedem Match wächst der Tennisplatz.

- Neue Vokabeln, Aufgaben und Tennis-Fragen stehen in `inhalte.js`.
- Läuft im Browser und lässt sich in Chrome über „App installieren“ auf den Startbildschirm legen.
- Der Lernstand liegt zuerst auf dem Gerät. Wer sich im Eltern-Tab anmeldet, gleicht ihn mit dem Familienspeicher (Supabase, Frankfurt) ab; der neuere Stand gewinnt. Eltern sehen dort Philips Wochenbericht. Die Anbindung steckt in `familie-sync.js` und wird auch von den anderen Apps genutzt.
- Ohne Anmeldung bleibt alles nur auf dem Gerät. Beim ersten Start wird der Lernstand aus Fenneks Lern-Oase übernommen, wenn beide unter derselben GitHub-Pages-Adresse laufen.
