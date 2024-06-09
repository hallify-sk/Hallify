# Hallify - Aplikácia

![Hallify banner](https://raw.githubusercontent.com/hallify-sk/github-assets/main/Hallify-Banner.png)

<p align="center">
  <img src="https://img.shields.io/github/stars/hallify-sk/Hallify?style=for-the-badge" alt=""/>
  <img src="https://img.shields.io/github/last-commit/hallify-sk/Hallify?style=for-the-badge" alt=""/>
  <img src="https://img.shields.io/github/issues/hallify-sk/Hallify?style=for-the-badge" alt=""/>
  <img src="https://img.shields.io/github/issues-pr/hallify-sk/Hallify?style=for-the-badge" alt=""/>
  <img src="https://img.shields.io/github/license/hallify-sk/Hallify?style=for-the-badge" alt=""/>
</p>

---

Hallify je najmodernejší rezervačný systém pre spoločenské sály, ktorý podporuje vytváranie rozložení sál. Tento repozitár obsahuje samostatnú aplikáciu, ktorú vytvárame a distribujeme.

> [!NOTE] > **Hallify je v štádiu skorého vývoja** - veľa vecí sa bude ešte meniť a produkt je momentálne nepoužiteľný v reálnom prostredí.

## Setup development prostredia

1. Naklónuj si [tento repozitár](https://github.com/hallify-sk/Hallify.git)
2. Zo stránky [pocketbase](https://pocketbase.io/docs) si stiahni vhodnú verziu pre tvoj operačný systém
3. Stiahnutý pocketbase vlož do priečinka `/pb`
4. Ak nemáš, stiahni si [Node.JS](https://nodejs.org/en), po inštalácií reštartuj PC
5. Otvor si prvý terminál v `/` a napíš doň `npm install`
6. Otvor si druhý terminál v `/pb` a napíš doň `./pocketbase serve` (ak máš nejaký problém, obráť sa na [pocketbase dokumentáciu](https://pocketbase.io/docs))
    > [!WARNING]
    > Ak PocketBase spustíš na inom porte ako `8090`, je veľká šanca že budeš musieť zmeniť obsah súboru `/config/pocketbase.json` na
    >
    > ```json
    > { "POCKETBASE_URL": "", "POCKETBASE_API_URL": "" }
    > ```
7. Otvor si pocketbase web editor, a vytvor si admin používateľa. Tento používateľ bude používaný aj na prístup do Hallify admin panelu
8. V prvom termináli po ukončení inštalácie môžeš zapnúť vývojársky server príkazom `npm run dev`
9. Hallify by mal byť spustený!
