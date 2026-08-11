This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3005](http://localhost:3005) with your browser to see the result.

## Authentication environment

Copy `.env.example` to a local environment file and replace the placeholders with secrets generated for that environment. `AUTH_SESSION_SECRET` and `AUTH_FINGERPRINT_SECRET` must be different random values of at least 32 bytes. Keep `TRUST_PROXY=false` unless the deployment has a trusted reverse proxy, and keep `ENABLE_DEV_STAFF_SWITCHER=false` outside an explicitly opted-in development session.

The application and production server use port `3005`. Set `APP_ORIGIN` to the externally visible origin for each deployment.

## Database migration and Owner bootstrap

Set `DATABASE_URL` for the intended MySQL database, confirm the target before making changes, and apply committed migrations:

```powershell
npx drizzle-kit migrate
```

Bootstrap `OWNER001` only from a secure shell. Supply `BOOTSTRAP_OWNER_PASSWORD` to that process without writing, echoing, or committing it, run the command, and clear the process variable immediately afterward:

```powershell
npm run auth:bootstrap-owner
```

The bootstrap command refuses missing or weak passwords and does not print the password or stored hash. Do not keep `BOOTSTRAP_OWNER_PASSWORD` in a persistent environment file.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# fitness-management
