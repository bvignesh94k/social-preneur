# Social Preneur

AI-assisted, multi-client social media management and automation platform.

## Project Structure

```
social-preneur/
├── apps/
│   └── web/              # Next.js web application
├── packages/
│   ├── db/               # Database schema & migrations (Drizzle)
│   ├── core/             # Domain logic & business rules
│   └── ui/               # Design system & components
├── docs/                 # Blueprint & documentation
└── index.html            # Homepage
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` in `apps/web`:

```bash
cp apps/web/.env.example apps/web/.env.local
```

4. Update environment variables with your database URL and API keys

5. Start the development server:

```bash
npm run dev
```

The app will be available at http://localhost:3000

### Demo Credentials

- Email: `email@example.com`
- Password: `password123`

## Features

### Phase 1 (MVP)
- Authentication & authorization
- Multi-client workspaces
- Social account management
- Content calendar
- Post scheduling
- Approval workflows
- Basic analytics

### Planned Features
- AI-powered content generation
- Client approval links (passwordless)
- Publishing automation
- Performance insights
- Brand management
- Integration with 6+ social platforms

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Better Auth
- **Hosting**: Vercel
- **Package Manager**: npm Workspaces

## Development

### Run Dev Server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

## Documentation

Full product blueprint and architecture: [Blueprint](./docs/postroom-blueprint.html)

## License

Proprietary - VTurnU Digital Solutions LLP
