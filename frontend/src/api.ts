import { storage } from "@/src/utils/storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "closetai_token";
const USER_KEY = "closetai_user";

export type User = {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  created_at: string;
};

export type WardrobeItem = {
  id: string;
  user_id: string;
  image_base64: string;
  category: string;
  name?: string | null;
  color?: string | null;
  rating: number;
  privacy: string;
  tags: string[];
  created_at: string;
};

export type WishlistItem = {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  target_price?: number | null;
  image_base64?: string | null;
  link?: string | null;
  price_results?:
    | {
        site: string;
        url: string;
        estimated_price_low: number;
        estimated_price_high: number;
        availability: string;
        note?: string;
        is_best_pick?: boolean;
      }[]
    | null;
  last_checked?: string | null;
  created_at: string;
};

export type Brand = {
  id: string;
  name: string;
  url: string;
  popular: boolean;
  user_added: boolean;
};

export type EventItem = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  date: string;
  location?: string | null;
  weather?: string | null;
  suggested_item_ids: string[];
  suggestion_note?: string | null;
  created_at: string;
};

export type Friend = {
  id: string;
  friend_user_id: string;
  friend_email: string;
  friend_name: string;
  friend_avatar?: string | null;
  access_level: "full" | "limited" | "none";
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "friends";
  created_at: string;
};

export type Message = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  text: string;
  recommended_item_id?: string | null;
  recommended_item_snapshot?: {
    id: string;
    category?: string;
    name?: string;
    color?: string;
    image_base64?: string;
  } | null;
  created_at: string;
  read: boolean;
};

export type Reminder = {
  id: string;
  user_id: string;
  title: string;
  type: "laundry" | "outfit_prep" | "shopping" | "other";
  remind_at: string;
  notes?: string | null;
  event_id?: string | null;
  notification_id?: string | null;
  done: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  built_in: boolean;
};

export type StyleProfile = {
  user_id: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  age_range?: string | null;
  gender?: string | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  neck_cm?: number | null;
  shoulder_cm?: number | null;
  sleeve_cm?: number | null;
  inseam_cm?: number | null;
  shoe_size?: string | null;
  body_shape?: string | null;
  styles: string[];
  skin_tone?: string | null;
  hair_color?: string | null;
  eye_color?: string | null;
  best_colors: string[];
  avoid_colors: string[];
  preferred_brands: string[];
  preferred_fits: string[];
  avatar_b64?: string | null;
  home_lat?: number | null;
  home_lon?: number | null;
  home_label?: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
};

export type Weather = {
  place?: string | null;
  lat: number;
  lon: number;
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  wind_kph: number;
  precip_mm: number;
  uv_index: number;
  condition: string;
  weather_code: number;
  summary: string;
  forecast: { date: string; temp_min_c: number; temp_max_c: number; precip_chance: number; condition: string }[];
};

export async function setSession(token: string, user: User) {
  await storage.secureSet(TOKEN_KEY, token);
  await storage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearSession() {
  await storage.secureRemove(TOKEN_KEY);
  await storage.removeItem(USER_KEY);
}

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet(TOKEN_KEY, "")) || null;
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await storage.getItem(USER_KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw as string) as User;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "Request failed";
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // auth
  signup: (email: string, password: string, name: string) =>
    request<{ token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: { email, password, name },
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  me: () => request<User>("/auth/me"),

  // password reset
  forgotPassword: (email: string) =>
    request<{ ok: true; cooldown_seconds?: number }>("/auth/forgot", {
      method: "POST",
      body: { email },
      auth: false,
    }),
  verifyOtp: (email: string, otp: string) =>
    request<{ reset_token: string }>("/auth/verify-otp", {
      method: "POST",
      body: { email, otp },
      auth: false,
    }),
  resetPassword: (reset_token: string, new_password: string) =>
    request<{ ok: true }>("/auth/reset", {
      method: "POST",
      body: { reset_token, new_password },
      auth: false,
    }),

  // categories
  listCategories: () => request<Category[]>("/categories"),
  addCategory: (name: string) =>
    request<Category>("/categories", { method: "POST", body: { name } }),
  deleteCategory: (id: string) =>
    request<{ ok: true }>(`/categories/${id}`, { method: "DELETE" }),

  // profile
  getProfile: () => request<StyleProfile>("/profile"),
  updateProfile: (patch: Partial<StyleProfile>) =>
    request<StyleProfile>("/profile", { method: "PATCH", body: patch }),

  // weather
  getWeather: (lat: number, lon: number) =>
    request<Weather>(`/weather?lat=${lat}&lon=${lon}`),

  // outfit gen
  outfitGenerator: (body: { occasion: string; notes?: string; lat?: number; lon?: number }) =>
    request<{ reply: string; session_id: string; recommended_item_ids: string[] }>(
      "/outfit/generator",
      { method: "POST", body },
    ),
  buildAround: (itemId: string, body: { notes?: string; lat?: number; lon?: number }) =>
    request<{ reply: string; session_id: string; anchor_item_id: string; recommended_item_ids: string[] }>(
      `/outfit/build-around/${itemId}`,
      { method: "POST", body },
    ),

  // wardrobe
  listWardrobe: (category?: string) =>
    request<WardrobeItem[]>(`/wardrobe${category ? `?category=${category}` : ""}`),
  addWardrobeItem: (body: {
    image_base64: string;
    category: string;
    name?: string;
    color?: string;
    rating?: number;
    privacy?: string;
    tags?: string[];
  }) => request<WardrobeItem>("/wardrobe", { method: "POST", body }),
  updateWardrobeItem: (
    id: string,
    body: Partial<{
      name: string;
      color: string;
      rating: number;
      privacy: string;
      category: string;
      tags: string[];
    }>,
  ) => request<WardrobeItem>(`/wardrobe/${id}`, { method: "PATCH", body }),
  deleteWardrobeItem: (id: string) =>
    request<{ ok: true }>(`/wardrobe/${id}`, { method: "DELETE" }),
  getWardrobeItem: (id: string) => request<WardrobeItem>(`/wardrobe/${id}`),

  // outfit chat
  outfitChat: (body: {
    message: string;
    session_id?: string;
    weather?: string;
    occasion?: string;
  }) =>
    request<{ reply: string; session_id: string; recommended_item_ids: string[] }>(
      "/outfit/chat",
      { method: "POST", body },
    ),

  // wishlist
  listWishlist: () => request<WishlistItem[]>("/wishlist"),
  addWishlist: (body: {
    name: string;
    description?: string;
    target_price?: number;
    image_base64?: string;
    link?: string;
  }) => request<WishlistItem>("/wishlist", { method: "POST", body }),
  deleteWishlist: (id: string) =>
    request<{ ok: true }>(`/wishlist/${id}`, { method: "DELETE" }),
  compareWishlist: (id: string) =>
    request<WishlistItem>(`/wishlist/${id}/compare`, { method: "POST" }),

  // brands
  listBrands: () => request<Brand[]>("/brands"),
  addBrand: (body: { name: string; url: string }) =>
    request<Brand>("/brands", { method: "POST", body }),
  deleteBrand: (id: string) =>
    request<{ ok: true }>(`/brands/${id}`, { method: "DELETE" }),

  // events
  listEvents: () => request<EventItem[]>("/events"),
  addEvent: (body: {
    title: string;
    description?: string;
    date: string;
    location?: string;
    weather?: string;
  }) => request<EventItem>("/events", { method: "POST", body }),
  deleteEvent: (id: string) =>
    request<{ ok: true }>(`/events/${id}`, { method: "DELETE" }),
  suggestEventOutfit: (id: string) =>
    request<EventItem>(`/events/${id}/suggest`, { method: "POST" }),

  // friends
  listFriends: () => request<Friend[]>("/friends"),
  sendFriendRequest: (email: string) =>
    request<Friend>("/friends/request", { method: "POST", body: { email } }),
  acceptFriend: (id: string) =>
    request<Friend>(`/friends/${id}/accept`, { method: "POST" }),
  removeFriend: (id: string) =>
    request<{ ok: true }>(`/friends/${id}`, { method: "DELETE" }),
  updateFriendAccess: (id: string, access_level: "full" | "limited" | "none") =>
    request<Friend>(`/friends/${id}/access`, { method: "PATCH", body: { access_level } }),
  viewFriendWardrobe: (friendUserId: string) =>
    request<WardrobeItem[]>(`/friends/${friendUserId}/wardrobe`),

  // messages
  listThreads: () =>
    request<
      {
        partner: { id: string; name: string; email: string; avatar?: string | null };
        last_message: { id: string; text: string; from_user_id: string; created_at: string };
        unread_count: number;
      }[]
    >("/messages"),
  getMessages: (friendUserId: string) =>
    request<Message[]>(`/messages/${friendUserId}`),
  sendMessage: (body: { to_user_id: string; text: string; recommended_item_id?: string }) =>
    request<Message>("/messages", { method: "POST", body }),

  // contacts lookup
  lookupUsers: (emails: string[]) =>
    request<
      {
        id: string;
        name: string;
        email: string;
        avatar?: string | null;
        friend_status?: "pending" | "accepted" | null;
      }[]
    >("/users/lookup", { method: "POST", body: { emails } }),

  // reminders
  listReminders: () => request<Reminder[]>("/reminders"),
  addReminder: (body: {
    title: string;
    type: "laundry" | "outfit_prep" | "shopping" | "other";
    remind_at: string;
    notes?: string;
    event_id?: string;
    notification_id?: string;
  }) => request<Reminder>("/reminders", { method: "POST", body }),
  updateReminder: (id: string, body: { done?: boolean; notification_id?: string }) =>
    request<Reminder>(`/reminders/${id}`, { method: "PATCH", body }),
  deleteReminder: (id: string) =>
    request<{ ok: true }>(`/reminders/${id}`, { method: "DELETE" }),
};
