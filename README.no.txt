Styr datamaskinen din fra Homey med en enkel enhetsflis og Flow-handlinger. Slå den på med Wake-on-LAN, se om den er tilgjengelig på nettverket, og slå den av eksternt via SSH når du er ferdig.

Datamaskin er nyttig i hverdagsrutiner som å starte en medie-PC før filmkveld, slå på en arbeidsstasjon når du kommer hjem, eller slå av en maskin automatisk ved leggetid. Legg til en eller flere datamaskiner i Homey, konfigurer nettverks- og SSH-innstillinger, og styr dem sammen med resten av hjemmet ditt.

Dette gjør appen
- Starter datamaskiner med Wake-on-LAN.
- Overvåker om hver datamaskin er tilgjengelig fra Homey.
- Slår av datamaskiner via SSH.
- Legger til Flow-handlingskort for å starte eller slå av en valgt datamaskin.
- Støtter flere datamaskiner, hver med egne innstillinger.

Før du legger til en enhet
- Aktiver Wake-on-LAN i datamaskinens BIOS eller UEFI og operativsystem.
- Gi datamaskinen en fast lokal IP-adresse eller DHCP-reservasjon.
- Aktiver SSH på datamaskinen.
- Noter datamaskinens IP-adresse, MAC-adresse, SSH-port, brukernavn og passord.
- For Linux og macOS må SSH-brukeren ha lov til å kjøre `sudo shutdown -h now`.

Slik fungerer det
- Når du slår på enheten, sendes en Wake-on-LAN-pakke.
- Når du slår av enheten, kobler appen til via SSH og kjører den konfigurerte avslåingskommandoen.
- Nettstatus sjekkes først med SSH. Hvis SSH er utilgjengelig, men ping svarer, viser Homey en tilkoblingsadvarsel.
