<h1 align="center">Chatbot</h1>

<p align="center">
  An open-source AI chatbot built with Next.js and the AI SDK.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#model-providers"><strong>Model Providers</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports OpenAI, Anthropic, Google, DeepSeek, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- Data Persistence
  - PostgreSQL (via [Drizzle ORM](https://orm.drizzle.team)) for saving chat history and user data
  - Redis for rate limiting and stream resumability
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication

## Model Providers

This project supports multiple AI model providers through the [AI SDK](https://ai-sdk.dev/docs/introduction). You can configure providers like [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Google](https://ai.google.dev), [DeepSeek](https://deepseek.com), [xAI](https://x.ai), [Mistral](https://mistral.ai), and [many more](https://ai-sdk.dev/providers/ai-sdk-providers).

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run the chatbot.

1. Copy `.env.example` to `.env.local` and fill in the values
2. Install dependencies and start the dev server:

```bash
pnpm install
pnpm db:migrate # Setup database or apply latest database changes
pnpm dev
```

Your app should now be running on [localhost:3000](http://localhost:3000).

## License

[Apache 2.0](./LICENSE)
