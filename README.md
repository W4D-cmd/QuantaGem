# Gemini Chat Interface

> [!WARNING]
> **Work-in-progress:** This project is currently in a very early stage. Only the minimum core functionality is implemented, and many features are still missing or incomplete.

A simple, open-source Next.js web interface for interacting with Google's Gemini AI API. It provides a ChatGPT-like chat experience with basic streaming response functionality, using PostgreSQL to store chat history.

## Features

- Interactive, ChatGPT-inspired chat interface
- Integration with Google's Gemini AI API
- Basic streaming responses
- Persistent conversation history (PostgreSQL)
- Support for free and paid Google API keys
- Markdown and code syntax highlighting
- Modern UI built with Next.js and Tailwind CSS

## Installation

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- Google Gemini API key ([get here](https://aistudio.google.com/))

### 1. Clone the repository:

```bash
git clone https://github.com/W4D-cmd/QuantaGem.git
```

### 2. Environment Configuration

Create a new file `.env.local` in the root of the repository. Copy and paste the content of the `.env` file into it and set your API keys.

> [!NOTE]
> If you do not have multiple Google accounts or wish to only use the free API simply put the same key for both entries.

```env
FREE_GOOGLE_API_KEY="your_free_google_api_key"
PAID_GOOGLE_API_KEY="your_paid_google_api_key"
```

You must also set `JWT_SECRET` to a random, cryptographically strong string.
This secret is vital for securing user sessions and should be at least 32 characters (256 bits) long.
You can generate a suitable value using `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and add it to your `.env.local` file.
```env
JWT_SECRET="your_jwt_secret"
```

## Running the Application

Inside the cloned repository execute the following command to start up the docker environment including the database and the Next.js app:

```bash
docker compose up --build
```

Open your browser at [http://localhost:3000](http://localhost:3000).

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/my-feature`).
3. Commit your changes (`git commit -am 'Add new feature'`).
4. Push to the branch (`git push origin feature/my-feature`).
5. Create a new pull request.

## License

Licensed under the MIT License. See [LICENSE](LICENSE) for details.
