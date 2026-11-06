# PDBull overlay — instalare în OBS

Totul rulează de pe GitHub Pages; se actualizează singur (verifică o versiune nouă la 2 minute și se reîncarcă).

## 0. O singură dată: accelerare hardware
OBS → **Settings → Advanced → Sources** → bifează **Enable Browser Source Hardware Acceleration** → OK → repornește OBS.

## 1. Dock-ul de control
1. **Docks → Custom Browser Docks…**
2. Dock Name: `PDBull` · URL: `https://pdbultoc.github.io/pdbull-overlay/panel.html` → **Apply**.
3. Sus în dock apare **Room** cu un cod. Butoanele de mai jos copiază link-urile cu codul tău.
4. La **Alerts → Streamlabs token**: lipește tokenul (Streamlabs → Settings → API Settings → API Tokens → *Your Socket API Token*). Rămâne doar în dock.
5. Șterge dock-ul și sursa de probă de la testul T1, dacă mai sunt.

## 2. Sursele (toate Browser Source, **1920 × 1080**)
| Scena | Buton în dock | Unde o pui |
|---|---|---|
| Joc | **Copy overlay link** | deasupra capturii de joc, deasupra camerei |
| Starting Soon | **Copy Starting link** | singura sursă din scenă |
| BRB | **Copy BRB link** | singura sursă din scenă |
| Ending Soon | **Copy End link** | singura sursă din scenă |

Pentru fiecare: **+ → Browser** → lipești link-ul în **URL** → Width 1920, Height 1080 → OK.
La **Starting** și **BRB** bifează **Shutdown source when not visible** (nu consumă placa video cât joci). Dacă la trecerea pe scenă vezi o clipă un cadru gol, debifează și spune-mi.

### 2a. Tranziția (Stinger)
1. Descarcă `assets/stinger-scroll.webm` din https://github.com/PDBultoc/pdbull-overlay (deschizi fișierul → **Download raw file**) într-un folder local care rămâne acolo.
2. OBS → **Scene Transitions** → **+** → **Stinger** → **Video File** = fișierul descărcat.
3. **Transition Point Type** = **Time (milliseconds)**, **Transition Point** = **1000**.
4. **Audio Monitoring** cum preferi.
5. Dacă apare un dreptunghi negru, spune-mi.

### 2b. Ending Soon
Scena veche (imagine + alertbox) nu mai trebuie: șterge imaginea și alertbox-ul. Pune în loc un **Browser Source** cu link-ul de la **Copy End link**, 1920 × 1080. Bifează **Shutdown source when not visible** și **Refresh browser when scene becomes active**. Dacă la trecerea pe scenă vezi o clipă un cadru gol, debifează și spune-mi.

### 2c. Sunet
Pe sursele Starting, BRB și End bifează **Control audio via OBS**. Volumul și pornit/oprit se reglează din cardul **Ambience** din dock.

### 2d. Bannerul de meci
Nu ai nimic de făcut: face parte din overlay. Îl pornești/oprești din cardul **Match banner** din dock.

### 2e. Casting (CaptureAge)
Scenă nouă în OBS, **Casting**, cu sursele în ordinea asta (de jos în sus):
1. **Window Capture** pe CaptureAge, jos.
2. Camera ta, deasupra, la **X 8, Y 755**, mărime **322 × 180** (același loc ca în scena de joc).
3. Deasupra tuturor, un **Browser Source** cu link-ul de la **Copy Casting link**, 1920 × 1080. Bifează **Control audio via OBS**.

Overlay-ul din scena asta arată rama camerei + chatul, alertele și reacțiile. Introul și bannerul de meci sunt oprite (CaptureAge arată deja datele astea).

Din cardul **Casting** din dock:
- **Follow player**: scrii un nume, apeși Enter și alegi profilul potrivit din listă (sau **Follow my own games**). Pentru meciul curent apar butoanele jucătorilor, grupate pe echipe.
- Dacă nu e niciun meci live, scrii jucătorii de mână în căsuța de jos, unul pe linie: `Nume #rrggbb`.
- Click pe un jucător, apoi pe o reacție: 1 Blunder, 2 Funny, 3 Wow, 4 Wololo, 5 Spotlight, 6 GG. Tastele 1–6 merg cât cardul Casting are focusul.
- Pad-ul 16:9 setează de unde pornesc Wow / Wololo / Spotlight; **Centre** îl readuce în mijloc.
- Scorul (B / W / F pe jucător) se resetează singur la meci nou; **Reset tally** îl resetează de mână.
- GG arată „Play of the game” și „Blunder of the game”, calculate din scor.
- **Sound** și **Volume**: sunetul trece prin OBS.
- O reacție nouă o înlocuiește pe cea care rulează; un GG poate fi înlocuit doar de alt GG.

## 3. Camera
În scena de joc, sursa camerei stă **sub** overlay, la **X 8, Y 755**, mărime **322 × 180** (rama de nuc din overlay o încadrează).

## 4. Folosire
- **Starting soon**: alegi minutele → **Start countdown**. La zero scrie „Starting now”. **Reset** oprește countdown-ul.
- **BRB → Text**: ce scrie fumul (implicit „Be right back”).
- **Alerts**: bifezi ce tipuri vrei; **sound** pornește/oprește sunetul; la *Sound follow/sub/bits/donation* poți pune un link către propriul fișier audio (gol = sunetul inclus). Butoanele de test arată fiecare alertă.
- **Intro**: pornește singur la începutul fiecărui meci (profilul tău aoe2companion, PDBull). **Test intro 1v1 / 4v4** îl arată oricând.

## 5. De știut
- Nu schimba bifele/sunetele de la Alerts **exact cât rulează o alertă**: alerta curentă se oprește.
- Dacă BRB se mișcă greu în timpul streamului, adaugă `&q=low` la sfârșitul link-ului din sursa BRB (mai puțin fum, fără blur).
- Chatul citește canalul `pdbull` fără cont (doar citire).
- Donația caritabilă Twitch, raid și Power-up nu au încă alertă proprie.
