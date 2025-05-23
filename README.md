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

> [!NOTE]
> **Hallify je v štádiu skorého vývoja** - veľa vecí sa bude ešte meniť a produkt je momentálne nepoužiteľný v reálnom prostredí.

## Setup development prostredia

1. Naklónujte si [tento repozitár](https://github.com/hallify-sk/Hallify.git)
2. Zo stránky [pocketbase](https://github.com/pocketbase/pocketbase/releases/tag/v0.22.13) si stiahnite označenú verziu pre Váš operačný systém
3. Stiahnutý pocketbase vložte do priečinka `/pb`
4. Ak nemáte, stiahnite si [Node.JS](https://nodejs.org/en), po inštalácií reštartujte PC
5. Otvorte si prvý terminál v `/` a napíšte doň `npm install`
6. Otvorte si druhý terminál v `/pb` a napíšte doň `./pocketbase serve` (ak máte nejaký problém, obráťte sa na [pocketbase dokumentáciu](https://pocketbase.io/docs))
> [!WARNING]
> Ak PocketBase spustíte na inom porte ako `8090`, je veľká šanca že budete musieť zmeniť obsah súboru `/config/pocketbase.json` na
   >
   > ```json
   > { "POCKETBASE_URL": "", "POCKETBASE_API_URL": "" }
   > ```
7. Otvorte si pocketbase web editor, a vytvorte si admin používateľa. Tento používateľ bude používaný aj na prístup do Hallify admin panelu
8. V prvom termináli po ukončení inštalácie môžete zapnúť vývojársky server príkazom `npm run dev`
9. Hallify by mal byť spustený!
