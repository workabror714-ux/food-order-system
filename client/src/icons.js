// icons.js — markaziy icon moduli (lucide-react, minimalistik stroke iconlar)
// Butun ilovada bir xil ko'rinish uchun ikkita narsa beradi:
//   1) <CategoryIcon name="Pizza" /> — category nomidan (uz+ru) avtomat mos icon
//   2) <AppIcon name="cart" />       — umumiy UI iconlari (string kalit orqali)
import {
  // Category / taom iconlari
  UtensilsCrossed, Pizza, Sandwich, Salad, Soup, Beef, Drumstick, Fish,
  IceCreamCone, CakeSlice, Croissant, CupSoda, GlassWater, Coffee,
  Wine, Beer, Flame, CookingPot,
  // Umumiy UI iconlari
  ShoppingCart, ShoppingBag, Package, PackageOpen, User, UserPlus, Search, X,
  Check, CheckCircle2, Trash2, CreditCard, Wallet, Banknote, MapPin, Phone,
  Smartphone, Home, Car, ClipboardList, Pencil, Plus, Save, Image as ImageIcon,
  ChefHat, Clock, PartyPopper, Rocket, Map as MapIcon, RefreshCw, AlertTriangle,
  Lock, Frown, Inbox, CircleHelp, Building2, Calendar, Mail, FileText, Palette,
  Megaphone, Eye, Ban, Cloud, Camera, Globe, ArrowRight, ArrowLeft, Tag, Video,
} from "lucide-react";

// Butun ilova uchun yagona stroke qalinligi (minimalistik ko'rinish)
export const DEFAULT_STROKE = 1.75;

// ---- Nomni normalizatsiya (apostroflar bir xil, kichik harf) ----
const norm = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[’‘`ʻʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// ---- Category → icon (kalit so'z bo'yicha, uz + ru) ----
// Tartib muhim: avval aniqroq (pizza, burger), keyin umumiy (asosiy menu).
const CATEGORY_RULES = [
  { icon: Pizza,        kw: ["pizza", "pitsa", "пицц"] },
  { icon: Sandwich,     kw: ["burger", "gamburger", "fast food", "fastfood", "бургер", "фастфуд", "сэндвич", "sendvich", "lavash", "лаваш", "hot dog", "hotdog", "xot-dog", "shaurma", "shawarma", "шаурм"] },
  { icon: Salad,        kw: ["salat", "salad", "салат"] },
  { icon: Soup,         kw: ["sho'rva", "shorva", "суп", "soup", "suyuq", "birinchi", "первое", "похлёб", "lagman", "лагман", "mastava", "мастав"] },
  { icon: Flame,        kw: ["grill", "гриль", "shashlik", "шашлык", "kabob", "kabab", "kebab", "кебаб", "barbe", "mangal", "мангал", "tandir", "тандыр"] },
  { icon: Drumstick,    kw: ["tovuq", "товук", "курин", "куриц", "chicken", "wings", "qanot", "крыл"] },
  { icon: Fish,         kw: ["baliq", "рыб", "fish", "sea food", "seafood", "море"] },
  { icon: Beef,         kw: ["go'sht", "gosht", "мяс", "steak", "стейк", "asortiment", "ассорти", "kabob asortiment"] },
  { icon: CookingPot,   kw: ["quyuq", "ikkinchi", "osh", "palov", "plov", "плов", "второе", "рагу", "manti", "mantı", "манты", "chuchvara", "чучвар", "dumlama", "hamir", "тесто", "пельмен", "varenik", "вареник", "somsa", "самс"] },
  { icon: Croissant,    kw: ["pide", "пиде", "non", "нон", "bread", "vypechka", "выпечк", "buloch", "булоч", "pirog", "пирог", "pizza non"] },
  { icon: IceCreamCone, kw: ["desert", "десерт", "dessert", "muzqaymoq", "морожен", "ice cream"] },
  { icon: CakeSlice,    kw: ["tort", "торт", "cake", "shirin", "shirinlik", "sweet", "выпеч", "pirojn", "пирожн", "chizkeyk", "cheesecake"] },
  { icon: Coffee,       kw: ["coffee", "kofe", "кофе", "choy", "чай", "tea", "kapuchino", "cappuc", "капучино", "latte", "латте"] },
  { icon: Wine,         kw: ["bar", "бар", "vino", "вин", "wine", "cocktail", "коктейл", "koktey"] },
  { icon: Beer,         kw: ["pivo", "пив", "beer", "alko", "алко"] },
  { icon: GlassWater,   kw: ["suv", "вода", "water", "mineral", "минерал"] },
  { icon: CupSoda,      kw: ["ichimlik", "ичимлик", "напит", "drink", "gazli", "газир", "limonad", "лимонад", "soda", "cola", "kola", "кола", "sok", "сок", "juice"] },
  { icon: UtensilsCrossed, kw: ["asosiy", "основн", "menyu", "menu", "меню", "kombo", "combo", "set", "сет", "taom", "блюд", "specials", "mahsulot"] },
];

export function resolveCategoryIcon(name) {
  const key = norm(name);
  if (key) {
    for (const rule of CATEGORY_RULES) {
      if (rule.kw.some((k) => key.includes(k))) return rule.icon;
    }
  }
  return UtensilsCrossed; // fallback
}

export function CategoryIcon({ name, size = 20, strokeWidth = DEFAULT_STROKE, className, ...rest }) {
  const Icon = resolveCategoryIcon(name);
  return <Icon size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}

// ---- Umumiy UI iconlari (string kalit → lucide komponent) ----
// statusUi.js kabi JSX'siz modullar shu kalitlarni qaytaradi, JSX shu yerda render qiladi.
const REGISTRY = {
  // navigatsiya / sahifalar
  menu: UtensilsCrossed, cart: ShoppingCart, bag: ShoppingBag, orders: Package,
  ordersOpen: PackageOpen, profile: User, home: Home, search: Search,
  // amallar
  close: X, check: Check, checkCircle: CheckCircle2, trash: Trash2,
  edit: Pencil, plus: Plus, save: Save, refresh: RefreshCw, eye: Eye,
  ban: Ban, addUser: UserPlus, camera: Camera, image: ImageIcon, cloud: Cloud,
  // to'lov / pul
  card: CreditCard, cash: Wallet, money: Banknote,
  // manzil / aloqa
  location: MapPin, map: MapIcon, phone: Phone, smartphone: Smartphone,
  mail: Mail, globe: Globe, building: Building2,
  // buyurtma holati
  taxi: Car, chef: ChefHat, clock: Clock, party: PartyPopper, rocket: Rocket,
  // hujjat / boshqa
  list: ClipboardList, file: FileText, calendar: Calendar, palette: Palette,
  banner: Megaphone, warning: AlertTriangle, lock: Lock, frown: Frown,
  inbox: Inbox, user: User,
  // strelkalar
  arrowRight: ArrowRight, arrowLeft: ArrowLeft,
  // promo / mashhur
  flame: Flame, tag: Tag, video: Video,
};

export function AppIcon({ name, size = 20, strokeWidth = DEFAULT_STROKE, className, ...rest }) {
  const Icon = REGISTRY[name] || CircleHelp;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}
