type DemoImageConfig = {
  title: string;
  subtitle: string;
  icon: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
  accent2: string;
};

const imageCatalog: Record<string, DemoImageConfig> = {
  rest_lb_steakhouse: {
    title: "LB Steakhouse",
    subtitle: "Prime Cuts",
    icon: "🥩",
    bgStart: "#2b1810",
    bgEnd: "#8a4b2d",
    accent: "#f3d1a8",
    accent2: "#d4823f",
  },
  item_ribeye: {
    title: "Prime Ribeye",
    subtitle: "Rosemary butter",
    icon: "🥩",
    bgStart: "#341810",
    bgEnd: "#b35d36",
    accent: "#ffd7ae",
    accent2: "#7b221a",
  },
  item_filet: {
    title: "Center Cut Filet",
    subtitle: "Sea salt finish",
    icon: "🍽️",
    bgStart: "#432018",
    bgEnd: "#b87844",
    accent: "#f7dfc1",
    accent2: "#7e3621",
  },
  item_caesar: {
    title: "Tableside Caesar",
    subtitle: "Parmesan + brioche",
    icon: "🥗",
    bgStart: "#24331b",
    bgEnd: "#86a44c",
    accent: "#f4f2cf",
    accent2: "#d9c57b",
  },
  item_butter_cake: {
    title: "Butter Cake",
    subtitle: "Warm berries",
    icon: "🍰",
    bgStart: "#5a3518",
    bgEnd: "#cf9344",
    accent: "#fff0c4",
    accent2: "#d56a3b",
  },
  rest_pizza_palace: {
    title: "Pizza Palace",
    subtitle: "Crowd Pleasers",
    icon: "🍕",
    bgStart: "#8e2a20",
    bgEnd: "#f07b3c",
    accent: "#ffe0a6",
    accent2: "#f9c74f",
  },
  item_pizza_margherita: {
    title: "Margherita Pizza",
    subtitle: "Mozzarella + basil",
    icon: "🍕",
    bgStart: "#a52f25",
    bgEnd: "#f68d4b",
    accent: "#fff0bb",
    accent2: "#4cae50",
  },
  item_pizza_bbq: {
    title: "BBQ Chicken",
    subtitle: "Onion + cilantro",
    icon: "🍕",
    bgStart: "#6d2f1d",
    bgEnd: "#d9763d",
    accent: "#ffe0b3",
    accent2: "#7ab55c",
  },
  item_pizza_knots: {
    title: "Garlic Knots",
    subtitle: "Roasted garlic butter",
    icon: "🥖",
    bgStart: "#6f4424",
    bgEnd: "#e0a35a",
    accent: "#fff1c6",
    accent2: "#c07032",
  },
  rest_green_leaf_salads: {
    title: "Green Leaf",
    subtitle: "Fresh & Bright",
    icon: "🥗",
    bgStart: "#1d4631",
    bgEnd: "#77c27a",
    accent: "#eef9d4",
    accent2: "#bfd948",
  },
  item_green_cobb: {
    title: "Cobb Power Salad",
    subtitle: "Chicken + avocado",
    icon: "🥗",
    bgStart: "#25503a",
    bgEnd: "#87c17a",
    accent: "#f0f7d2",
    accent2: "#f2c14e",
  },
  item_green_kale: {
    title: "Kale Caesar",
    subtitle: "Parmesan crunch",
    icon: "🥬",
    bgStart: "#1a4a35",
    bgEnd: "#6cab72",
    accent: "#ebf6d0",
    accent2: "#d7b35c",
  },
  item_green_wrap: {
    title: "Chicken Wrap",
    subtitle: "Mediterranean style",
    icon: "🌯",
    bgStart: "#295341",
    bgEnd: "#8fc27c",
    accent: "#f0f8d4",
    accent2: "#dba85a",
  },
  rest_sakura_sushi_house: {
    title: "Sakura Sushi",
    subtitle: "Polished Rolls",
    icon: "🍣",
    bgStart: "#2b244f",
    bgEnd: "#ea7ca2",
    accent: "#fbe3ff",
    accent2: "#8fd3ff",
  },
  item_sakura_salmon_roll: {
    title: "Salmon Crunch Roll",
    subtitle: "Avocado + crunch",
    icon: "🍣",
    bgStart: "#35295e",
    bgEnd: "#ee8bb0",
    accent: "#fde5ff",
    accent2: "#8bd7ff",
  },
  item_sakura_tuna_bowl: {
    title: "Spicy Tuna Bowl",
    subtitle: "Sesame rice bowl",
    icon: "🍚",
    bgStart: "#3b2e65",
    bgEnd: "#f0908b",
    accent: "#ffe9fb",
    accent2: "#9bd7ff",
  },
  item_sakura_edamame: {
    title: "Sea Salt Edamame",
    subtitle: "Chili flake finish",
    icon: "🫛",
    bgStart: "#295043",
    bgEnd: "#79c597",
    accent: "#eff9d8",
    accent2: "#f3da6a",
  },
  rest_sunrise_taqueria: {
    title: "Sunrise Taqueria",
    subtitle: "Bright Tacos",
    icon: "🌮",
    bgStart: "#6e1f25",
    bgEnd: "#f39c3d",
    accent: "#ffeab3",
    accent2: "#ffdf70",
  },
  item_taco_al_pastor: {
    title: "Al Pastor Trio",
    subtitle: "Pineapple + cilantro",
    icon: "🌮",
    bgStart: "#81252c",
    bgEnd: "#f5a043",
    accent: "#ffefbb",
    accent2: "#9ed45f",
  },
  item_taco_burrito: {
    title: "Carne Asada Burrito",
    subtitle: "Rice + beans + crema",
    icon: "🌯",
    bgStart: "#714023",
    bgEnd: "#df8b4c",
    accent: "#ffedc3",
    accent2: "#ce5d41",
  },
  item_taco_street_corn: {
    title: "Street Corn Cup",
    subtitle: "Cotija + chile",
    icon: "🌽",
    bgStart: "#6f4c20",
    bgEnd: "#f1b54c",
    accent: "#fff3ca",
    accent2: "#de7b32",
  },
  rest_midnight_noodle_bar: {
    title: "Midnight Noodle",
    subtitle: "Late Night Bowls",
    icon: "🍜",
    bgStart: "#1f243f",
    bgEnd: "#675de6",
    accent: "#e9e6ff",
    accent2: "#ff8d6d",
  },
  item_noodle_garlic_chili: {
    title: "Garlic Chili Noodles",
    subtitle: "Crisp + scallion",
    icon: "🍜",
    bgStart: "#2a2146",
    bgEnd: "#7864e3",
    accent: "#efe9ff",
    accent2: "#ff9168",
  },
  item_noodle_miso_udon: {
    title: "Miso Sesame Udon",
    subtitle: "Nutty miso sauce",
    icon: "🥢",
    bgStart: "#32264f",
    bgEnd: "#8e6ae8",
    accent: "#f2edff",
    accent2: "#ffb36b",
  },
  item_noodle_gyoza: {
    title: "Pork Gyoza",
    subtitle: "Pan-seared dumplings",
    icon: "🥟",
    bgStart: "#4a2d2a",
    bgEnd: "#d97c56",
    accent: "#ffe6d6",
    accent2: "#f4bf74",
  },
  rest_harbor_sandwich_co: {
    title: "Harbor Sandwich Co",
    subtitle: "Lunch Ready",
    icon: "🥪",
    bgStart: "#18344a",
    bgEnd: "#5ba2d6",
    accent: "#e3f4ff",
    accent2: "#ffd174",
  },
  item_harbor_turkey_club: {
    title: "Turkey Avocado Club",
    subtitle: "Bacon aioli",
    icon: "🥪",
    bgStart: "#21415a",
    bgEnd: "#68b1df",
    accent: "#e5f5ff",
    accent2: "#9ed16a",
  },
  item_harbor_pastrami_melt: {
    title: "Pastrami Melt",
    subtitle: "Swiss + onion",
    icon: "🥪",
    bgStart: "#443125",
    bgEnd: "#d28359",
    accent: "#ffe6d0",
    accent2: "#f1c55e",
  },
  item_harbor_tomato_soup: {
    title: "Tomato Soup Cup",
    subtitle: "Basil oil",
    icon: "🍅",
    bgStart: "#7a2c27",
    bgEnd: "#eb7457",
    accent: "#ffe2d8",
    accent2: "#f6c45f",
  },
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderDemoImageSvg(config: DemoImageConfig) {
  const title = escapeXml(config.title);
  const subtitle = escapeXml(config.subtitle);
  const icon = escapeXml(config.icon);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="${config.bgStart}"/>
      <stop offset="100%" stop-color="${config.bgEnd}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.34)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="900" rx="56" fill="url(#bg)"/>
  <circle cx="260" cy="220" r="220" fill="${config.accent}" opacity="0.18"/>
  <circle cx="1010" cy="170" r="110" fill="${config.accent2}" opacity="0.22"/>
  <circle cx="980" cy="730" r="200" fill="${config.accent}" opacity="0.15"/>
  <rect x="72" y="72" width="1056" height="756" rx="44" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  <text x="104" y="160" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="44" font-weight="700" fill="rgba(255,255,255,0.82)" letter-spacing="8">
    PHANTOM DEMO
  </text>
  <text x="104" y="700" font-family="Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, sans-serif" font-size="280">${icon}</text>
  <text x="104" y="470" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="94" font-weight="700" fill="#fff7ed">
    ${title}
  </text>
  <text x="104" y="548" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="42" font-weight="500" fill="rgba(255,247,237,0.88)">
    ${subtitle}
  </text>
  <rect x="780" y="624" width="262" height="88" rx="22" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
  <text x="911" y="680" text-anchor="middle" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="30" font-weight="700" fill="#fff7ed">
    LIVE MENU ART
  </text>
</svg>`;
}

export function getDemoImageSvg(slug: string) {
  return imageCatalog[slug] ? renderDemoImageSvg(imageCatalog[slug]) : null;
}

