/**
 * Complete Gardenscapes catalogs mined from the GSEditor reference bundle
 * (`assets/index-t1jm1ArR.js`), cross-checked against the GSEditor APK
 * `classes.dex` string table. Every entry below is a real in-game id — no
 * curated subsets.
 *
 * Regenerate with: node _ref/extractcats.mjs <bundle> <out.json>
 */

export interface GsCatalogEntry {
  /** Save-file id, e.g. `Cinema_Badge` / `Expedition_b25` / `Ostin`. */
  id: string;
  /** English display label. */
  label: string;
  /** Russian display label (reference editor ships ru + en). */
  labelRu?: string;
  /** True for the "Grand" / "_Post" upgraded variant of an entry. */
  grand: boolean;
  /** CDN art path relative to the asset base, when it differs from `${id}.png`. */
  art?: string;
  /** Emoji shown when no PNG is available (badges only). */
  emoji?: string;
  /** Accent colour paired with `emoji` (badges only). */
  color?: string;
}

/** Profile badges: `Features.ProfileBadgesGFF.Core.OwnedBadges`. */
export const GS_BADGES: GsCatalogEntry[] = [
  { id: "Cinema_Badge", label: "Cinema", labelRu: "Кинотеатр", grand: false, art: "Gardenscapes/Badges/cinema.png", emoji: "🎬", color: "#8e44ad" },
  { id: "Cinema_Badge_Grand", label: "Cinema (Grand)", labelRu: "Кинотеатр (гранд)", grand: true, art: "Gardenscapes/Badges/cinema_grand.png", emoji: "🎬", color: "#8e44ad" },
  { id: "WinterBell_Badge", label: "Winter Bell", labelRu: "Зимний колокольчик", grand: false, art: "Gardenscapes/Badges/seasonal.png", emoji: "🔔", color: "#2980b9" },
  { id: "WinterBell_Badge_Grand", label: "Winter Bell (Grand)", labelRu: "Зимний колокольчик (гранд)", grand: true, art: "Gardenscapes/Badges/seasonal_grand.png", emoji: "🔔", color: "#2980b9" },
  { id: "SportTorch_Badge", label: "Sport Torch", labelRu: "Олимпийский факел", grand: false, art: "Gardenscapes/Badges/torchment.png", emoji: "🔥", color: "#e67e22" },
  { id: "SportTorch_Badge_Grand", label: "Sport Torch (Grand)", labelRu: "Олимпийский факел (гранд)", grand: true, art: "Gardenscapes/Badges/torchment_grand.png", emoji: "🔥", color: "#e67e22" },
  { id: "TravelCompass_Badge", label: "Travel Compass", labelRu: "Компас путешественника", grand: false, art: "Gardenscapes/Badges/compas.png", emoji: "🧭", color: "#16a085" },
  { id: "TravelCompass_Badge_Grand", label: "Travel Compass (Grand)", labelRu: "Компас путешественника (гранд)", grand: true, art: "Gardenscapes/Badges/compas_grand.png", emoji: "🧭", color: "#16a085" },
  { id: "SeasonalCardsCollection2_Badge", label: "Seasonal Cards", labelRu: "Сезонная коллекция (цветок)", grand: false, art: "Gardenscapes/Badges/flower.png", emoji: "🌸", color: "#e84393" },
  { id: "SeasonalCardsCollection2_Badge_Grand", label: "Seasonal Cards (Grand)", labelRu: "Сезонная коллекция (цветок) (гранд)", grand: true, art: "Gardenscapes/Badges/flower_grand.png", emoji: "🌸", color: "#e84393" },
  { id: "CardsCollection1_Badge", label: "Cards Collection 1", labelRu: "Коллекция карточек 1", grand: false, art: "Gardenscapes/Badges/Seasonal2_flower.png", emoji: "🎴", color: "#d63031" },
  { id: "CardsCollection1_Badge_Grand", label: "Cards Collection 1 (Grand)", labelRu: "Коллекция карточек 1 (гранд)", grand: true, art: "Gardenscapes/Badges/Seasonal2_flower_grand.png", emoji: "🎴", color: "#d63031" },
  { id: "Fair_Badge", label: "Fair Token", labelRu: "Ярмарочный жетон", grand: false, emoji: "🎡", color: "#f39c12" },
  { id: "Fair_Badge_Grand", label: "Fair Token (Grand)", labelRu: "Ярмарочный жетон (гранд)", grand: true, emoji: "🎡", color: "#f39c12" },
  { id: "Magic_Badge", label: "Magic", labelRu: "Магия", grand: false, emoji: "🔮", color: "#8e44ad" },
  { id: "Magic_Badge_Grand", label: "Magic (Grand)", labelRu: "Магия (гранд)", grand: true, emoji: "🔮", color: "#8e44ad" },
];

/** Expedition profile titles: `Features.ExpeditionTitlesGFF.ExpeditionTitles`. */
export const GS_TITLES: GsCatalogEntry[] = [
  { id: "Expedition_b25", label: "Ship", labelRu: "Корабль", grand: false, art: "Gardenscapes/Titles/Expedition_25.png" },
  { id: "Expedition_b25_Post", label: "Ship (Grand)", labelRu: "Корабль (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_25_post.png" },
  { id: "Expedition32", label: "Helicopter", labelRu: "Вертолёт", grand: false, art: "Gardenscapes/Titles/Expedition_32.png" },
  { id: "Expedition32_Post", label: "Helicopter (Grand)", labelRu: "Вертолёт (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_32_post.png" },
  { id: "expedition33", label: "Dog", labelRu: "Собака", grand: false, art: "Gardenscapes/Titles/Expedition_33.png" },
  { id: "expedition33_Post", label: "Dog (Grand)", labelRu: "Собака (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_33_post.png" },
  { id: "expedition34", label: "Horse", labelRu: "Лошадь", grand: false, art: "Gardenscapes/Titles/Expedition_34.png" },
  { id: "expedition34_Post", label: "Horse (Grand)", labelRu: "Лошадь (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_34_post.png" },
  { id: "expedition35", label: "Hourglass", labelRu: "Песочные часы", grand: false, art: "Gardenscapes/Titles/Expedition_35.png" },
  { id: "expedition35_Post", label: "Hourglass (Grand)", labelRu: "Песочные часы (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_35_post.png" },
  { id: "expedition36", label: "Season 36", labelRu: "Сезон 36", grand: false, art: "Gardenscapes/Titles/Expedition_36.png" },
  { id: "expedition36_Post", label: "Season 36 (Grand)", labelRu: "Сезон 36 (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_36_post.png" },
  { id: "expedition37", label: "Season 37", labelRu: "Сезон 37", grand: false, art: "Gardenscapes/Titles/Expedition_37.png" },
  { id: "expedition37_Post", label: "Season 37 (Grand)", labelRu: "Сезон 37 (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_37_post.png" },
  { id: "expedition38", label: "Season 38", labelRu: "Сезон 38", grand: false, art: "Gardenscapes/Titles/Expedition_38.png" },
  { id: "expedition38_Post", label: "Season 38 (Grand)", labelRu: "Сезон 38 (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_38_post.png" },
  { id: "Exp39", label: "Inheritance Hunt", labelRu: "Охота за наследством", grand: false, art: "Gardenscapes/Titles/Expedition_39.png" },
  { id: "Exp39_Post", label: "Inheritance Hunt (Grand)", labelRu: "Охота за наследством (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_39_post.png" },
  { id: "Exp40", label: "Polar Station", labelRu: "Полярная станция", grand: false, art: "Gardenscapes/Titles/Expedition_40.png" },
  { id: "Exp40_Post", label: "Polar Station (Grand)", labelRu: "Полярная станция (гранд)", grand: true, art: "Gardenscapes/Titles/Expedition_40_post.png" },
];

/** Player avatars (`AvatarStyle` / `AvatarStyleHistory`). */
export const GS_AVATARS: GsCatalogEntry[] = [
  { id: "Ostin", label: "Ostin", grand: false, art: "Gardenscapes/Avatars/Ostin.png" },
  { id: "Alex", label: "Alex", grand: false, art: "Gardenscapes/Avatars/Alex.png" },
  { id: "Cat", label: "Cat", grand: false, art: "Gardenscapes/Avatars/Cat.png" },
  { id: "Catherine", label: "Catherine", grand: false, art: "Gardenscapes/Avatars/Catherine.png" },
  { id: "Dog", label: "Dog", grand: false, art: "Gardenscapes/Avatars/Dog.png" },
  { id: "Duck", label: "Duck", grand: false, art: "Gardenscapes/Avatars/Duck.png" },
  { id: "Jason", label: "Jason", grand: false, art: "Gardenscapes/Avatars/Jason.png" },
  { id: "Jen", label: "Jen", grand: false, art: "Gardenscapes/Avatars/Jen.png" },
  { id: "Lucy", label: "Lucy", grand: false, art: "Gardenscapes/Avatars/Lucy.png" },
  { id: "Melinda", label: "Melinda", grand: false, art: "Gardenscapes/Avatars/Melinda.png" },
  { id: "Exp3_Rachel", label: "Exp3 Rachel", grand: false, labelRu: "Рэйчел", art: "Gardenscapes/Avatars/Exp3Rachel.png" },
  { id: "Robbie", label: "Robbie", grand: false, art: "Gardenscapes/Avatars/Robbie.png" },
  { id: "Sandra", label: "Sandra", grand: false, art: "Gardenscapes/Avatars/Sandra.png" },
  { id: "YoungOstin", label: "YoungOstin", grand: false, labelRu: "Остин (юный)", art: "Gardenscapes/Avatars/AustinYoung.png" },
  { id: "Exp13_Catherine", label: "Exp13 Catherine", grand: false, labelRu: "Кэтрин (эксп.)", art: "Gardenscapes/Avatars/CatherineExp.png" },
  { id: "Exp16_Pirate", label: "Exp16 Pirate", grand: false, labelRu: "Пират (эксп.)", art: "Gardenscapes/Avatars/Pirate.png" },
  { id: "Exp17_Rada", label: "Exp17 Rada", grand: false, labelRu: "Рада (эксп.)", art: "Gardenscapes/Avatars/Rada.png" },
  { id: "Exp19_Patrick", label: "Exp19 Patrick", grand: false, labelRu: "Патрик (эксп.)", art: "Gardenscapes/Avatars/Patrick.png" },
  { id: "Exp20_Bird", label: "Exp20 Bird", grand: false, labelRu: "Птица (эксп.)", art: "Gardenscapes/Avatars/Bird.png" },
  { id: "Exp21_Christmas", label: "Exp21 Christmas", grand: false, labelRu: "Рождество (эксп.)", art: "Gardenscapes/Avatars/Christmas.png" },
  { id: "ExpGREECE_MazeMason", label: "ExpGREECE MazeMason", grand: false, labelRu: "Мэйсон (Греция)", art: "Gardenscapes/Avatars/MasonGreece.png" },
  { id: "ExpHOCUSPOCUS_Cat", label: "ExpHOCUSPOCUS Cat", grand: false, labelRu: "Кот (Фокус-покус)", art: "Gardenscapes/Avatars/CatHocusPocus.png" },
  { id: "Expedition_atlantis_Avatar", label: "Expedition atlantis Avatar", grand: false, labelRu: "Атлантида", art: "Gardenscapes/Avatars/Atlantis.png" },
  { id: "Expedition_china_Avatar", label: "Expedition china Avatar", grand: false, labelRu: "Китай", art: "Gardenscapes/Avatars/China.png" },
  { id: "Expedition_factory_Avatar", label: "Expedition factory Avatar", grand: false, labelRu: "Фабрика", art: "Gardenscapes/Avatars/Factory.png" },
  { id: "Expedition_garden_Avatar", label: "Expedition garden Avatar", grand: false, labelRu: "Сад", art: "Gardenscapes/Avatars/Garden.png" },
  { id: "Expedition_snowqueen_Avatar", label: "Expedition snowqueen Avatar", grand: false, labelRu: "Снежная королева", art: "Gardenscapes/Avatars/SnowQueen.png" },
  { id: "Expedition_western_Avatar", label: "Expedition western Avatar", grand: false, labelRu: "Вестерн", art: "Gardenscapes/Avatars/Western.png" },
  { id: "Ext_Bill", label: "Ext Bill", grand: false, labelRu: "Билл", art: "Gardenscapes/Avatars/Bill.png" },
  { id: "Ext_Capybara", label: "Ext Capybara", grand: false, labelRu: "Капибара", art: "Gardenscapes/Avatars/Capybara.png" },
  { id: "Ext_Cat", label: "Ext Cat", grand: false, labelRu: "Кот", art: "Gardenscapes/Avatars/ExtCat.png" },
  { id: "Ext_Nora", label: "Ext Nora", grand: false, labelRu: "Нора", art: "Gardenscapes/Avatars/Nora.png" },
  { id: "Ext_Priya", label: "Ext Priya", grand: false, labelRu: "Прия", art: "Gardenscapes/Avatars/Priya.png" },
  { id: "Birthday2023", label: "Birthday2023", grand: false, labelRu: "День рождения 2023", art: "Gardenscapes/Avatars/Birthday2023.png" },
  { id: "Birthday2024", label: "Birthday2024", grand: false, labelRu: "День рождения 2024", art: "Gardenscapes/Avatars/Birthday2024.png" },
  { id: "Birthday_2022", label: "Birthday 2022", grand: false, labelRu: "День рождения 2022", art: "Gardenscapes/Avatars/Birthday2022.png" },
  { id: "S37_Austin", label: "S37 Austin", grand: false, labelRu: "Остин (сезон 37)", art: "Gardenscapes/Avatars/AustinSeason37.png" },
  { id: "S38_Robbie", label: "S38 Robbie", grand: false, labelRu: "Робби (сезон 38)", art: "Gardenscapes/Avatars/RobbieSeason38.png" },
  { id: "S39_Sheep", label: "S39 Sheep", grand: false, labelRu: "Овечка (сезон 39)", art: "Gardenscapes/Avatars/Sheep.png" },
  { id: "S40_Austin", label: "S40 Austin", grand: false, labelRu: "Остин (сезон 40)", art: "Gardenscapes/Avatars/AustinSeason40.png" },
  { id: "GPlayReward_Robby", label: "GPlayReward Robby", grand: false, labelRu: "Робби (Google Play)" },
  { id: "LSR_DogPirate", label: "LSR DogPirate", grand: false, labelRu: "Пёс-пират" },
];

/** Profile frames — owned set (`framesowned`). */
export const GS_FRAMES: GsCatalogEntry[] = [
  { id: "Frame_Birdhouse", label: "Birdhouse", grand: false, art: "Gardenscapes/Frames/bird_house.png" },
  { id: "Frame_Cinema", label: "Cinema", grand: false },
  { id: "Frame_Feather", label: "Feather", grand: false, art: "Gardenscapes/Frames/feather.png" },
  { id: "Frame_Festival", label: "Festival", grand: false },
  { id: "Frame_Music", label: "Music", grand: false, art: "Gardenscapes/Frames/music.png" },
  { id: "Frame_Neon", label: "Neon", grand: false },
  { id: "Frame_Plane", label: "Plane", grand: false, art: "Gardenscapes/Frames/plane.png" },
  { id: "Frame_PolarLights", label: "PolarLights", grand: false, art: "Gardenscapes/Frames/polar_lights.png" },
  { id: "Frame_Dragon", label: "Dragon", grand: false },
];

/** Frames that are activated by an effect rather than owned permanently. */
export const GS_FRAMES_ACTIVATABLE: GsCatalogEntry[] = [
  { id: "Frame_Cosmos", label: "Cosmos", grand: false, art: "Gardenscapes/Frames/cosmos.png" },
  { id: "TS_Ice", label: "Ice", grand: false, art: "Gardenscapes/Frames/ts_ice.png" },
  { id: "TS_Violet", label: "Violet", grand: false, art: "Gardenscapes/Frames/ts_violet.png" },
];

/** Player name styles (`PlayerNameStyle` / `NameStyleHistory`). */
export const GS_STYLES: GsCatalogEntry[] = [
  { id: "NameStyle_Fire", label: "Fire", grand: false, art: "Gardenscapes/Styles/NameStyle_Fire.png" },
  { id: "NameStyle_Glamour", label: "Glamour", grand: false, art: "Gardenscapes/Styles/NameStyle_Glamour.png" },
  { id: "NameStyle_Garland", label: "Garland", grand: false, art: "Gardenscapes/Styles/NameStyle_Garland.png" },
  { id: "NameStyle_Neon", label: "Neon", grand: false, art: "Gardenscapes/Styles/NameStyle_Neon.png" },
  { id: "NameStyle_Dragon", label: "Dragon", grand: false, art: "Gardenscapes/Styles/NameStyle_Dragon.png" },
  { id: "NameStyle_Test", label: "Test", grand: false, art: "Gardenscapes/Styles/NameStyle_Test.png" },
];

export const GS_BADGE_ART: Record<string, string> = {
  "Cinema_Badge": "Gardenscapes/Badges/cinema.png",
  "Cinema_Badge_Grand": "Gardenscapes/Badges/cinema_grand.png",
  "WinterBell_Badge": "Gardenscapes/Badges/seasonal.png",
  "WinterBell_Badge_Grand": "Gardenscapes/Badges/seasonal_grand.png",
  "SportTorch_Badge": "Gardenscapes/Badges/torchment.png",
  "SportTorch_Badge_Grand": "Gardenscapes/Badges/torchment_grand.png",
  "TravelCompass_Badge": "Gardenscapes/Badges/compas.png",
  "TravelCompass_Badge_Grand": "Gardenscapes/Badges/compas_grand.png",
  "SeasonalCardsCollection2_Badge": "Gardenscapes/Badges/flower.png",
  "SeasonalCardsCollection2_Badge_Grand": "Gardenscapes/Badges/flower_grand.png",
  "CardsCollection1_Badge": "Gardenscapes/Badges/Seasonal2_flower.png",
  "CardsCollection1_Badge_Grand": "Gardenscapes/Badges/Seasonal2_flower_grand.png",
};

export const GS_TITLE_ART: Record<string, string> = {
  "Expedition_b25": "Gardenscapes/Titles/Expedition_25.png",
  "Expedition_b25_Post": "Gardenscapes/Titles/Expedition_25_post.png",
  "Expedition32": "Gardenscapes/Titles/Expedition_32.png",
  "Expedition32_Post": "Gardenscapes/Titles/Expedition_32_post.png",
  "expedition33": "Gardenscapes/Titles/Expedition_33.png",
  "expedition33_Post": "Gardenscapes/Titles/Expedition_33_post.png",
  "expedition34": "Gardenscapes/Titles/Expedition_34.png",
  "expedition34_Post": "Gardenscapes/Titles/Expedition_34_post.png",
  "expedition35": "Gardenscapes/Titles/Expedition_35.png",
  "expedition35_Post": "Gardenscapes/Titles/Expedition_35_post.png",
  "expedition36": "Gardenscapes/Titles/Expedition_36.png",
  "expedition36_Post": "Gardenscapes/Titles/Expedition_36_post.png",
  "expedition37": "Gardenscapes/Titles/Expedition_37.png",
  "expedition37_Post": "Gardenscapes/Titles/Expedition_37_post.png",
  "expedition38": "Gardenscapes/Titles/Expedition_38.png",
  "expedition38_Post": "Gardenscapes/Titles/Expedition_38_post.png",
  "Exp39": "Gardenscapes/Titles/Expedition_39.png",
  "Exp39_Post": "Gardenscapes/Titles/Expedition_39_post.png",
  "Exp40": "Gardenscapes/Titles/Expedition_40.png",
  "Exp40_Post": "Gardenscapes/Titles/Expedition_40_post.png",
};

export const GS_AVATAR_ART: Record<string, string> = {
  "Ostin": "Gardenscapes/Avatars/Ostin.png",
  "Alex": "Gardenscapes/Avatars/Alex.png",
  "Cat": "Gardenscapes/Avatars/Cat.png",
  "Catherine": "Gardenscapes/Avatars/Catherine.png",
  "Dog": "Gardenscapes/Avatars/Dog.png",
  "Duck": "Gardenscapes/Avatars/Duck.png",
  "Jason": "Gardenscapes/Avatars/Jason.png",
  "Jen": "Gardenscapes/Avatars/Jen.png",
  "Lucy": "Gardenscapes/Avatars/Lucy.png",
  "Melinda": "Gardenscapes/Avatars/Melinda.png",
  "Exp3_Rachel": "Gardenscapes/Avatars/Exp3Rachel.png",
  "Robbie": "Gardenscapes/Avatars/Robbie.png",
  "Sandra": "Gardenscapes/Avatars/Sandra.png",
  "YoungOstin": "Gardenscapes/Avatars/AustinYoung.png",
  "Exp13_Catherine": "Gardenscapes/Avatars/CatherineExp.png",
  "Exp16_Pirate": "Gardenscapes/Avatars/Pirate.png",
  "Exp17_Rada": "Gardenscapes/Avatars/Rada.png",
  "Exp19_Patrick": "Gardenscapes/Avatars/Patrick.png",
  "Exp20_Bird": "Gardenscapes/Avatars/Bird.png",
  "Exp21_Christmas": "Gardenscapes/Avatars/Christmas.png",
  "ExpGREECE_MazeMason": "Gardenscapes/Avatars/MasonGreece.png",
  "ExpHOCUSPOCUS_Cat": "Gardenscapes/Avatars/CatHocusPocus.png",
  "Expedition_atlantis_Avatar": "Gardenscapes/Avatars/Atlantis.png",
  "Expedition_china_Avatar": "Gardenscapes/Avatars/China.png",
  "Expedition_factory_Avatar": "Gardenscapes/Avatars/Factory.png",
  "Expedition_garden_Avatar": "Gardenscapes/Avatars/Garden.png",
  "Expedition_snowqueen_Avatar": "Gardenscapes/Avatars/SnowQueen.png",
  "Expedition_western_Avatar": "Gardenscapes/Avatars/Western.png",
  "Ext_Bill": "Gardenscapes/Avatars/Bill.png",
  "Ext_Capybara": "Gardenscapes/Avatars/Capybara.png",
  "Ext_Cat": "Gardenscapes/Avatars/ExtCat.png",
  "Ext_Nora": "Gardenscapes/Avatars/Nora.png",
  "Ext_Priya": "Gardenscapes/Avatars/Priya.png",
  "Birthday2023": "Gardenscapes/Avatars/Birthday2023.png",
  "Birthday2024": "Gardenscapes/Avatars/Birthday2024.png",
  "Birthday_2022": "Gardenscapes/Avatars/Birthday2022.png",
  "S37_Austin": "Gardenscapes/Avatars/AustinSeason37.png",
  "S38_Robbie": "Gardenscapes/Avatars/RobbieSeason38.png",
  "S39_Sheep": "Gardenscapes/Avatars/Sheep.png",
  "S40_Austin": "Gardenscapes/Avatars/AustinSeason40.png",
};

export const GS_FRAME_ART: Record<string, string> = {
  "Frame_Birdhouse": "Gardenscapes/Frames/bird_house.png",
  "Frame_Feather": "Gardenscapes/Frames/feather.png",
  "Frame_Music": "Gardenscapes/Frames/music.png",
  "Frame_Plane": "Gardenscapes/Frames/plane.png",
  "Frame_PolarLights": "Gardenscapes/Frames/polar_lights.png",
  "Frame_Cosmos": "Gardenscapes/Frames/cosmos.png",
  "TS_Ice": "Gardenscapes/Frames/ts_ice.png",
  "TS_Violet": "Gardenscapes/Frames/ts_violet.png",
};

/**
 * Content hashes for every Gardenscapes asset the reference editor knows
 * about, keyed by CDN path. Used to build cache-busted icon URLs.
 */
export const GS_ASSETS: Record<string, string> = {
  "Gardenscapes/Avatars/Alex.png": "55b590a2ed54a65445fd",
  "Gardenscapes/Avatars/Atlantis.png": "43660b9a20f44bde1983",
  "Gardenscapes/Avatars/AustinSeason37.png": "5604414622a3d37befd8",
  "Gardenscapes/Avatars/AustinSeason40.png": "511acea0d32c6574f106",
  "Gardenscapes/Avatars/AustinYoung.png": "6f9ddc63525b09d48317",
  "Gardenscapes/Avatars/Bill.png": "e56d10650a5619724e37",
  "Gardenscapes/Avatars/Bird.png": "ebd0a7abd07eec2e9c21",
  "Gardenscapes/Avatars/Birthday2022.png": "5986d1927acabf819171",
  "Gardenscapes/Avatars/Birthday2023.png": "fe54126840a253e592cc",
  "Gardenscapes/Avatars/Birthday2024.png": "a0f44aa3cb86c901f921",
  "Gardenscapes/Avatars/Capybara.png": "b8c8a50adfda073ff08d",
  "Gardenscapes/Avatars/Cat.png": "f0710f1b5876f8ecfa68",
  "Gardenscapes/Avatars/Catherine.png": "4fe1cfe16f1e9341a37f",
  "Gardenscapes/Avatars/CatherineExp.png": "e1f717d76e275b4a332d",
  "Gardenscapes/Avatars/CatHocusPocus.png": "69831403511c760fe797",
  "Gardenscapes/Avatars/China.png": "0d2d76937ae67cc07847",
  "Gardenscapes/Avatars/Christmas.png": "6da442246f7a5c0c1c52",
  "Gardenscapes/Avatars/Dog.png": "177ad0c986a801408eb2",
  "Gardenscapes/Avatars/Duck.png": "dab5276df3d207677e43",
  "Gardenscapes/Avatars/Exp3Rachel.png": "d9b02bd9022d0738a1f5",
  "Gardenscapes/Avatars/ExtCat.png": "d80b3a5d7bc914e15fec",
  "Gardenscapes/Avatars/Factory.png": "621d51d891380faa68f1",
  "Gardenscapes/Avatars/Garden.png": "b7860e35f31fe973fe9c",
  "Gardenscapes/Avatars/GPlayReward_Robby.png": "8bce6186d570885b2ba9",
  "Gardenscapes/Avatars/Jason.png": "2411272a7eff73511aa7",
  "Gardenscapes/Avatars/Jen.png": "5151db1e457a14eea9bb",
  "Gardenscapes/Avatars/LSR_DogPirate.png": "68570398c23da34a9b86",
  "Gardenscapes/Avatars/Lucy.png": "e0d10269d10f2e660fb3",
  "Gardenscapes/Avatars/MasonGreece.png": "bc5c549d986e9a816fa4",
  "Gardenscapes/Avatars/Melinda.png": "9638c30418b42d4deb95",
  "Gardenscapes/Avatars/Nora.png": "622b8dc288e1ce318533",
  "Gardenscapes/Avatars/Ostin.png": "1580a7fee8fc1a10cbca",
  "Gardenscapes/Avatars/Patrick.png": "14b93e385c7860e041ab",
  "Gardenscapes/Avatars/Pirate.png": "e349f43c0a8a4f2cd5f3",
  "Gardenscapes/Avatars/Priya.png": "ee0e94c44b1e4ee1e8bf",
  "Gardenscapes/Avatars/Rada.png": "79d9b747a620cfb3371f",
  "Gardenscapes/Avatars/Robbie.png": "585f7fa0f3d3b676900a",
  "Gardenscapes/Avatars/RobbieSeason38.png": "2934c8fd1e7f99d5f520",
  "Gardenscapes/Avatars/Sandra.png": "ba5b54a200fb1a36224b",
  "Gardenscapes/Avatars/Sheep.png": "950dfbd6daf654e4e8cc",
  "Gardenscapes/Avatars/SnowQueen.png": "df769b225ee18c931c01",
  "Gardenscapes/Avatars/Western.png": "0b6225a5e3e9e193aaaa",
  "Gardenscapes/Badges/cinema.png": "7e82009401dfcd33ba00",
  "Gardenscapes/Badges/cinema_grand.png": "36710081fcc1e2c67160",
  "Gardenscapes/Badges/compas.png": "e705035b0ab6042166e5",
  "Gardenscapes/Badges/compas_grand.png": "7eef7798c1344808ad52",
  "Gardenscapes/Badges/fair.png": "86bf2de3c78a1bbcfaf1",
  "Gardenscapes/Badges/fair_grand.png": "369318907a8083aa98a1",
  "Gardenscapes/Badges/flower.png": "3368478c5064eb1a7b80",
  "Gardenscapes/Badges/flower_grand.png": "a8e97602eacdf7deda49",
  "Gardenscapes/Badges/magic.png": "6c54f4bb52fef1665b23",
  "Gardenscapes/Badges/magic_grand.png": "dbda994bc3b74ca895f7",
  "Gardenscapes/Badges/seasonal.png": "8af9e1cff9cec9afbfcd",
  "Gardenscapes/Badges/Seasonal2_flower.png": "80ea763e00ee65ae9f6d",
  "Gardenscapes/Badges/Seasonal2_flower_grand.png": "9329f55dfd3ffac51546",
  "Gardenscapes/Badges/seasonal_grand.png": "b5f9634448aa42a7cad2",
  "Gardenscapes/Badges/torchment.png": "be873ed269d6bfb92038",
  "Gardenscapes/Badges/torchment_grand.png": "bbef33ff6309a8f13b25",
  "Gardenscapes/Boosters/Arrow.png": "e2a7e984ac5665804457",
  "Gardenscapes/Boosters/Bomb.png": "e5b0585c36678496f899",
  "Gardenscapes/Boosters/Bomb_Unlimited.png": "e00f755d8b52c11dd133",
  "Gardenscapes/Boosters/Dynamite.png": "45ff4fb3be49d562bb70",
  "Gardenscapes/Boosters/Dynamite_Unlimited.png": "c7ea041c5d24f01cfee2",
  "Gardenscapes/Boosters/Fan.png": "cebb92dbcba3ae9ae422",
  "Gardenscapes/Boosters/Rainbow.png": "6fc2c8bd8947dfb7a484",
  "Gardenscapes/Boosters/Rainbow_Unlimited.png": "7b327010b8ac73d2235f",
  "Gardenscapes/Boosters/Shovel.png": "a8234befafdce7c34c45",
  "Gardenscapes/Boosters/Weight.png": "4c322d080e3592ec9fee",
  "Gardenscapes/Boosters/x2.png": "9239c63434a7f0ac40ca",
  "Gardenscapes/Boosters/x2_Unlimited.png": "e72f95fb2a7559be9efe",
  "Gardenscapes/Frames/bird_house.png": "fd53ca9ab8b0227717da",
  "Gardenscapes/Frames/cosmos.png": "c59940d9c0753c2077ec",
  "Gardenscapes/Frames/feather.png": "a1dcbbd2d13619470788",
  "Gardenscapes/Frames/Frame_Cinema.png": "ff1158645c3030be7df2",
  "Gardenscapes/Frames/Frame_Dragon.png": "a256eb810b621ba3a245",
  "Gardenscapes/Frames/Frame_Festival.png": "252ae0cbc8656f8a011b",
  "Gardenscapes/Frames/Frame_Neon.png": "4ea7e28bf9fc2206cbdc",
  "Gardenscapes/Frames/music.png": "8b9da31029245f51a9fb",
  "Gardenscapes/Frames/plane.png": "f9ca319c33ce71876301",
  "Gardenscapes/Frames/polar_lights.png": "03e419a56785d57f89a0",
  "Gardenscapes/Frames/ts_ice.png": "d0a6c5557fa080b6488f",
  "Gardenscapes/Frames/ts_violet.png": "cd23c077e23a64fcb31c",
  "Gardenscapes/Styles/NameStyle_Dragon.png": "d6d4d4dff53883dd683e",
  "Gardenscapes/Styles/NameStyle_Fire.png": "88d8bdffbd3431a1a93e",
  "Gardenscapes/Styles/NameStyle_Garland.png": "8b2b8c17b79a0d7de895",
  "Gardenscapes/Styles/NameStyle_Glamour.png": "00a7174019ee508d2f4e",
  "Gardenscapes/Styles/NameStyle_Neon.png": "8f03626cc7e9461c3947",
  "Gardenscapes/Styles/NameStyle_Test.png": "112600e0be64fc14bf3f",
  "Gardenscapes/Titles/Expedition_25.png": "1feb14fd08352fb34b42",
  "Gardenscapes/Titles/Expedition_25_post.png": "667112ef98f316d7b295",
  "Gardenscapes/Titles/Expedition_32.png": "78b1894a0fa4de7789a1",
  "Gardenscapes/Titles/Expedition_32_post.png": "29593d2f319c6e18fc5b",
  "Gardenscapes/Titles/Expedition_33.png": "212fa547b3db23da412c",
  "Gardenscapes/Titles/Expedition_33_post.png": "20cac0147e10b28bc5c7",
  "Gardenscapes/Titles/Expedition_34.png": "ff9f29da696f3ac3b72c",
  "Gardenscapes/Titles/Expedition_34_post.png": "82d4e769834a8ba74434",
  "Gardenscapes/Titles/Expedition_35.png": "af82930c72ffc83c9eed",
  "Gardenscapes/Titles/Expedition_35_post.png": "2316c42dc2944ea676f3",
  "Gardenscapes/Titles/Expedition_36.png": "dcf3b3df89ed7ece02ce",
  "Gardenscapes/Titles/Expedition_36_post.png": "23bf7681ace1b151d7fa",
  "Gardenscapes/Titles/Expedition_37.png": "6031ffe42ff45319db5e",
  "Gardenscapes/Titles/Expedition_37_post.png": "0d2b98fb60e8397bbe73",
  "Gardenscapes/Titles/Expedition_38.png": "578b24febea31eb1391b",
  "Gardenscapes/Titles/Expedition_38_post.png": "484e245a99ce9f8cf690",
  "Gardenscapes/Titles/Expedition_39.png": "c38e52c64e5330269ef8",
  "Gardenscapes/Titles/Expedition_39_post.png": "579c81eab361f739805a",
  "Gardenscapes/Titles/Expedition_40.png": "7f8f6b133df04c1010da",
  "Gardenscapes/Titles/Expedition_40_post.png": "0200e5f813769916fbb8",
};

/** Resolve a Gardenscapes CDN path to a cache-busted URL. */
export function gsAssetUrl(base: string, path: string): string {
  const hash = GS_ASSETS[path];
  return hash ? `${base}/${path}?v=${hash}` : `${base}/${path}`;
}

/** Booster id -> CDN art file name. */
export const GS_BOOSTER_ART: Record<string, string> = {
  "BombAndLineBoost": "BombAndLine.png",
  "LightningBoost": "Rainbow.png",
  "MultiplyFishBoost": "Planes.png",
  "HammerBonus": "Hummer.png",
  "HorizontalLineBoosterBonus": "HorizontalRocket.png",
  "VerticalLineBoosterBonus": "VerticalRocket.png",
  "ReshuffleBoosterBonus": "Fan.png",
  "SwapBoosterBonus": "Gloves.png"
};

// ---------------------------------------------------------------------------
// Cards — derived from the save's own vocabulary, never hand-typed
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export interface GsCard {
  /** Zero-padded save id, e.g. `card_03` / `card_150`. */
  id: string;
  /** 1-based card number. */
  number: number;
  /** The set this card belongs to. */
  setId: string;
}

/**
 * The card catalog is `card_01..card_150`, and a card's set is its group of
 * ten: `set = pad2(floor((n-1)/10)+1)` (15 sets cover 150 cards). Derived
 * formula, not a curated list — verified **15/15** against the live MEmu
 * save's `OwnedSets.lastSeenProgress` and cross-checked against the distinct
 * ids mined from three real saves (`card_03` .. `card_137`, all zero-padded).
 * Every measured save holds exactly 15 `OwnedSets` rows, which is where the
 * catalog stops: a `card_151` would need `set_16` and no save has one.
 */
export const GS_CARDS: GsCard[] = Array.from({ length: 150 }, (_, i) => {
  const n = i + 1;
  return { id: `card_${pad2(n)}`, number: n, setId: `set_${pad2(Math.floor(i / 10) + 1)}` };
});

/** The 15 set rows every save holds (`Features.<CardC*>.Core.OwnedSets`). */
export const GS_CARD_SETS: string[] = Array.from({ length: 15 }, (_, i) => `set_${pad2(i + 1)}`);

/**
 * The 6 `GivenPackInfos` rows every save holds — field order measured as
 * `{count g, id s}` on all three corpus saves.
 */
export const GS_CARD_PACKS: string[] = [
  "PackLevel1", "PackLevel2", "PackLevel3", "PackLevel4", "PackLevel5", "StartPack",
];

/** Card id -> catalog entry, or null for an id outside `card_01..card_150`. */
export function gsCardById(id: string): GsCard | null {
  return GS_CARDS.find((c) => c.id === id) ?? null;
}

/** The set a card id belongs to (groups of ten), or null when unknown. */
export function gsCardSet(cardId: string): string | null {
  return gsCardById(cardId)?.setId ?? null;
}

/** Total entry count, handy for sanity checks in tests. */
export const GS_CATALOG_SIZES = {
  badges: GS_BADGES.length,
  titles: GS_TITLES.length,
  avatars: GS_AVATARS.length,
  frames: GS_FRAMES.length,
  framesActivatable: GS_FRAMES_ACTIVATABLE.length,
  styles: GS_STYLES.length,
  assets: Object.keys(GS_ASSETS).length,
  cards: GS_CARDS.length,
  cardSets: GS_CARD_SETS.length,
  cardPacks: GS_CARD_PACKS.length,
} as const;