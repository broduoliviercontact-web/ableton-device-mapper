# Ableton Device Mapper

Créer des Remote Scripts Ableton pour contrôler les devices natifs Ableton Live depuis le navigateur.

[English](README.md) · [Installation](docs/ABLETON_INSTALLATION.md) · [Dépannage](docs/TROUBLESHOOTING.md)

## Qu'est-ce qu'Ableton Device Mapper ?

Ableton Device Mapper capture les messages MIDI CC, les associe aux paramètres catalogués des devices natifs de Live, puis exporte un pack Remote Script Python prêt à installer. Tout fonctionne localement dans le navigateur, sans compte ni backend.

Le projet prend en charge des instruments, effets audio et effets MIDI comme Operator, Wavetable, Drift, Simpler, Sampler, Auto Filter, EQ Eight, Roar, Hybrid Reverb, Arpeggiator et Expression Control.

Contrairement à M4L Remote Mapper, aucun patch Max for Live n'est généré ou nécessaire : cette application cible directement les devices natifs.

## Pourquoi ?

Le MIDI Map de Live convient parfaitement aux assignations propres à un Set. Un mapping réutilisable demande toutefois un Remote Script capable de découvrir les devices, résoudre les paramètres, adapter leurs plages et produire des logs utiles. L'application génère ce boilerplate depuis une interface visuelle.

## Fonctionnement

```mermaid
flowchart LR
  A[Contrôleur MIDI] --> B[Web MIDI]
  B --> C[Ableton Device Mapper]
  C --> D[Export ZIP]
  D --> E[Remote Script Ableton]
  E --> F[Device natif Ableton]
```

## Fonctionnalités

- Capture Web MIDI CC
- Catalogue Live 12.4.5b6 : 83 devices et 2 746 paramètres
- Filtres par catégorie, device et paramètre
- Paramètres recommandés, sections et risques
- Presets 8 Knobs, 8 Faders, 16 Controls, Operator, Auto Filter et EQ Eight
- Résolution sécurisée par aliases avant l'index
- Scaling MIDI vers `parameter.min` / `parameter.max`
- Fallback par index désactivé par défaut
- `BUILD_ID`, logs Live, Setup Wizard et install checker
- Export ZIP entièrement local

## Démarrage rapide

```bash
npm --prefix client install
npm run dev
```

Ouvrir l'URL Vite dans un navigateur Chromium, activer le MIDI, choisir un device natif, appliquer un layout puis exporter le pack.

## Installation dans Ableton

Le ZIP contient uniquement le Remote Script et ses outils :

```text
Ableton_Device_Mapper_Pack/
├── 1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/<scriptSlug>/
├── 2_READ_ME_FIRST.md
├── INSTALL_CHECK.command
└── TROUBLESHOOTING.md
```

Copier seulement `<scriptSlug>/` dans `~/Music/Ableton/User Library/Remote Scripts/`, redémarrer Live, sélectionner la Control Surface et l'entrée MIDI. Output doit rester sur `None`.

## Choisir et mapper un device natif

Filtrer par instrument, effet audio ou effet MIDI. Le script mémorise le nom visible et la classe Live, puis cherche sur la piste sélectionnée, toutes les pistes, les retours, Master et les racks imbriqués.

Chaque paramètre est cherché par alias exact puis normalisé. Garder **Allow index fallback if name is missing** désactivé sauf nécessité explicite.

## Nommer son script

Avant l'export, choisir un **Nom du script** descriptif. Il devient l'identité de la Control Surface pendant l'installation, tandis que le générateur produit automatiquement des identifiants compatibles :

```text
Operator NanoKontrol Remote
→ dossier/fichier : Operator_NanoKontrol_Remote
→ classe Python : OperatorNanoKontrolRemote
```

Les espaces, accents et signes de ponctuation sont convertis. Un nom commençant par un chiffre reçoit le préfixe `Script`. Préférer la formule **Device + Contrôleur + Remote** à un nom générique comme `test` :

- `Operator NanoKontrol Remote`
- `Drift BeatStep Remote`
- `Auto Filter LaunchControl XL Remote`

Réutiliser le même nom remplace l'ancien dossier après réinstallation. Le nom participe aussi au `BUILD_ID` déterministe.

## Scaling MIDI

```text
MIDI 0–127 → normalisation 0.0–1.0 → parameter.min–parameter.max
```

## Démo Operator connue-bonne

| CC | Paramètre |
| ---: | --- |
| 16 | Volume |
| 17 | Tone |
| 18 | Filter Freq |
| 19 | Filter Res |
| 20–23 | Osc-A à Osc-D Level |

## Dépannage

- Device absent : charger le device et sélectionner sa piste.
- Paramètre absent : comparer `profile.json` et `available parameters` dans Log.txt.
- Mauvais paramètre : désactiver le fallback, supprimer les anciens dossiers et vérifier `BUILD_ID`.
- Rien ne bouge : vérifier Control Surface, Input, redémarrage et `__pycache__`.

Voir [le guide de dépannage](docs/TROUBLESHOOTING.md).

## Développement

```bash
npm test
npm --prefix client run build
```

## Limites et roadmap

Le navigateur ne peut pas installer le script directement, Live doit redémarrer, Web MIDI dépend du navigateur et le catalogue correspond à Live 12.4.5b6. La roadmap prévoit davantage de layouts musicaux, de templates contrôleurs, l'import/export de presets et davantage d'actions Live.

## Licence

Publié sous [licence MIT](LICENSE). Ce projet indépendant n'est ni affilié ni approuvé par Ableton.
