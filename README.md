# StTools-Manager

Gestionnaire local Steam & Lua écrit en **Rust**, avec une interface épurée **100% en français**, **5 thèmes** (`Classic` par défaut, `Catppuccin Mocha`, `Tokyo Night`, `Nord`, `Emerald`), **sans Discord** et **sans téléchargement de jeux**.

## Exécutables disponibles

- **`StTools-Manager-Installer.exe`** : Installateur autonome en un seul fichier (thème *Classic*, icône dédiée, interrupteurs modernes, détection automatique de mise à jour, désinstallation intégrée, et musique *Yume Nikki - Barracks Settlement* muette par défaut avec bouton icône). Déploie `StTools-Manager.exe` et `WebView2Loader.dll`, crée les raccourcis Bureau / Démarrer et enregistre la désinstallation dans Windows.
- **`StTools-Manager.exe`** : Application principale autonome (nécessite `WebView2Loader.dll` dans le même dossier).

## Mises à jour automatiques

Au démarrage, l'application vérifie automatiquement la dernière release publiée sur **`SteamUnlocker/StTools-Manager`**. Lorsqu'une nouvelle version est disponible et que l'option est activée dans **Paramètres**, elle télécharge l'exécutable, remplace la version locale et redémarre automatiquement.

## Organisation de l'interface

- **Accueil** : Compteur de scripts Lua, état des modules Steam, zone glisser-déposer de fichiers `.lua` / `.st` / `.manifest`, et jaquettes des jeux récents.
- **Bibliothèque** : Recherche instantanée par nom de jeu (catalogue Steam mis en cache), AppID ou nom de fichier ; filtres (`Tous`, `Actifs`, `Inactifs`), activation/désactivation en un clic (`.lua` ↔ `.lua.disabled`), sélection multiple, suppression sécurisée et éditeur Lua intégré.
- **Mode** : Installation, mise à jour, activation/désactivation et suppression de **BetterSteamTools** (`madoiscool/BetterSteamTools`) et **CloudRedirect** (`madoiscool/CloudRedirect`), avec configuration automatique de `opensteamtool.toml`.
- **Paramètres** : Raccourcis vers les dossiers Steam (`Steam`, `stplug-in`, `depotcache`), sélecteur de thème, mises à jour automatiques de l'application et du catalogue de noms Steam, état des DLLs et contrôle audio.
- **Redémarrer Steam** : Action directe accessible depuis l'en-tête.
