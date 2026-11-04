Styr datamaskinen din fra Homey med en enkel enhetsflis og Flow-handlinger. Slå den på med Wake-on-LAN, se om den er tilgjengelig på nettverket, og slå den av eksternt via SSH når du er ferdig.

Datamaskin er nyttig i hverdagsrutiner som å starte en medie-PC før filmkveld, slå på en arbeidsstasjon når du kommer hjem, eller slå av en maskin automatisk ved leggetid. Legg til en eller flere datamaskiner i Homey, konfigurer nettverks- og SSH-innstillinger, og styr dem sammen med resten av hjemmet ditt.

Dette gjør appen
- Starter datamaskiner med Wake-on-LAN.
- Overvåker om hver datamaskin er tilgjengelig fra Homey.
- Slår av datamaskiner via SSH.
- Setter datamaskiner i dvale eller dvalemodus via SSH.
- Legger til Flow-handlingskort for å starte, slå av, sette i dvale eller sette i dvalemodus for en valgt datamaskin, samt handlinger for alle datamaskiner.
- Støtter flere datamaskiner, hver med egne innstillinger.

Før du legger til en enhet
- Aktiver Wake-on-LAN i datamaskinens BIOS eller UEFI og operativsystem.
- Gi datamaskinen en fast lokal IP-adresse eller DHCP-reservasjon.
- Aktiver SSH på datamaskinen.
- Noter datamaskinens IP-adresse, MAC-adresse, SSH-port, brukernavn og passord.
- For Linux og macOS må SSH-brukeren ha lov til å kjøre `sudo shutdown -h now`, `sudo systemctl suspend` og `sudo systemctl hibernate` (Linux), samt `sudo pmset sleepnow` (macOS).

Slik fungerer det
- Når du slår på enheten, sendes en Wake-on-LAN-pakke.
- Når du slår av enheten, setter den i dvale eller dvalemodus, kobler appen til via SSH på hver konfigurert IP til én lykkes og kjører angitt avslåingskommando eller støttet dvale-/dvalemoduskommando for valgt operativsystem.
- Nettstatus sjekkes først med SSH. Hvis SSH er utilgjengelig, men ping svarer, viser Homey en tilkoblingsadvarsel.

Merknader per operativsystem
- Windows støtter avslåing og dvalemodus; dvale er utsatt fordi SetSuspendState ikke er kompatibel med rundll32.
- Linux bruker `systemctl suspend` og `systemctl hibernate` med sudo.
- macOS bruker `pmset sleepnow` for dvale; dvalemodus støttes ikke for å unngå varige endringer i strøminnstillingene.

Dvale og dvalemodus krever en vellykket SSH-avslutningskode innen 30 sekunder. Frakobling eller tidsavbrudd gir en feil selv om datamaskinen gikk i dvale; sjekk tilgjengeligheten før du prøver igjen. Suksess bekrefter kommandoen, ikke maskinvarens støtte for dvale og vekking. Wake-on-LAN etter dvale avhenger av fastvare, nettverkskort og operativsystem; SSH-oppstart krever en separat tilgjengelig kontroller.
