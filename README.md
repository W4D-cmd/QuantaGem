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

### 3. Customizing the Speech-to-Text (STT) Model

The application uses the `medium` as the default model for Speech-to-Text transcription. You can change this to any other model from the Faster Whisper family to balance performance and accuracy according to your hardware and needs.

To change the model, you need to edit the model identifier string in the STT service's source code.

1.  Open the file `stt-service/main.py`.
2.  Locate the `model_size` variable at the top of the file.

    ```python
    model_size = "medium"
    compute_type = "int8"
    ```

3.  Replace the string value of `model_size` (e.g., `"medium"`) with the name of your desired model from the list below (e.g., `"distil-large-v3"`).
4.  Save the file and rebuild the Docker container using `docker compose up --build` for the changes to take effect.

<details>
<summary><b>Available Faster Whisper Models</b></summary>

Here is a list of available models, grouped by type. Larger models are more accurate but slower and require more resources.

#### Standard Models (Multilingual)
*   `tiny`
*   `base`
*   `small`
*   `medium`
*   `large-v1`
*   `large-v2`
*   `large-v3`

#### English-Only Models (.en)
*   `tiny.en`
*   `base.en`
*   `small.en`
*   `medium.en`

#### Distilled Models (distil)
*   `distil-small.en`
*   `distil-medium.en`
*   `distil-large-v2`
*   `distil-large-v3`

</details>

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
