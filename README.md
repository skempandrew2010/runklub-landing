Run Klub is a platform that helps runners discover local run clubs, weekly group runs, and running communities all in one place.

Instead of searching through Instagram posts, Strava pages, Facebook groups, and club websites, runners can quickly find nearby runs on an interactive map and clubs can manage their community through a single platform.

Features For Runners

- 🗺️ Interactive map of nearby run clubs
- 📍 Distance-based club discovery
- 📅 Weekly run calendar
- ❤️ Subscribe to favorite clubs
- 🔍 Filter by pace, day, and location
- 👤 User authentication
- 📱 Responsive design for desktop and mobile

For Club Managers
- Create and manage clubs
- Edit club information
- Manage upcoming runs
- View subscriber counts
- Manage club dashboard
- Claim existing clubs
- Email subscriber management (coming soon)

Tech Stack Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
Backend
- Supabase
- PostgreSQL
- Supabase Authentication
- Row Level Security (RLS)
- Maps & Location
- Mapbox GL JS
- Mapbox Geocoding API
Deployment
- Vercel
- Supabase Cloud

Why Run Klub?

Finding a running community shouldn't require searching across multiple platforms.

Run Klub centralizes:

Club information Weekly schedules Locations Community discovery

Whether you're traveling, moving to a new city, or just looking for new people to run with, Run Klub makes discovering local running communities simple.

Project Structure app/ ├── dashboard/ ├── explore/ ├── login/ ├── signup/ ├── api/

components/ ├── Map/ ├── Clubs/ ├── Calendar/ ├── Dashboard/

lib/ ├── supabase/ ├── mapbox/ ├── utils/

public/


Getting Started (for if i somehow forget) Clone the repository git clone https://github.com/yourusername/run-klub.git

cd run-klub Install dependencies npm install Create a .env.local NEXT_PUBLIC_SUPABASE_URL=

NEXT_PUBLIC_SUPABASE_ANON_KEY=

NEXT_PUBLIC_MAPBOX_TOKEN= Run locally npm run dev

Visit:

http://localhost:3000 Database

Run Klub uses PostgreSQL through Supabase.

Main tables include:

users clubs runs subscriptions

Authentication and authorization are handled using Supabase Auth with Row Level Security.

Completed:
Interactive map Club discovery Authentication Club management dashboard Run calendar User subscriptions Distance sorting Responsive UI

In Progress: 
Club email broadcasting Club subscription tiers

Future Updates: 
Mobile app (but maybe not with how apple and google mess with subscription payments) AI running coach Attendance tracking Club subscriptions/payments Event registration Personalized recommendations Push notifications Social features
