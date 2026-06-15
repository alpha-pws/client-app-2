# ClosetAI — Product Requirements (MVP)

## Vision
An AI-powered wardrobe assistant: snap photos of clothes, get outfit suggestions, plan event looks, compare prices across favourite shopping sites, and share/recommend outfits with friends.

## Tech
- **Frontend**: Expo Router (React Native) — light theme, Swiss & High-Contrast design system
- **Backend**: FastAPI + MongoDB (motor)
- **AI**: Claude Sonnet (model `claude-sonnet-4-6`) via Emergent Universal LLM key + `emergentintegrations`
- **Auth**: Email + password (JWT, bcrypt), token stored in expo-secure-store

## Features (shipped MVP)
1. **Auth** — Email/password signup & login.
2. **Wardrobe** — Camera + gallery capture, categorize (tops/bottoms/outerwear/dresses/shoes/accessories), name/color, 1-5 self-rating, privacy (public/friends/private). Grid view, item detail with edit/delete.
3. **AI Stylist Chat** — Tell it weather + occasion. Pulls from your wardrobe, returns suggestion + visual cards of recommended items.
4. **Calendar** — Add events; per-event "Suggest Outfit" generates AI pick + shows wardrobe item thumbnails.
5. **Wishlist + Price Compare** — Add desired items, get AI price comparison across default brands + user-added sites; highlights best pick.
6. **Brands** — Pre-loaded popular sites (Amazon, Myntra, Zara, H&M, ASOS, Nike, Uniqlo, Adidas, Shein, Nordstrom) + add custom sites.
7. **Friends** — Search by email, send/accept friend requests, per-friend access level (none / limited = 4★+ only / full).
8. **Friend Wardrobe View** — Browse a friend's shared closet, tap any item to send a recommendation to them with a message.
9. **Messaging** — 1-on-1 chat between friends. Threads list with unread badges. Messages can carry an outfit recommendation snapshot.

## Future Smart Enhancement (Revenue)
- Affiliate-tagged outgoing links in wishlist for monetisation
- Premium tier: unlimited AI suggestions / advanced price tracking
