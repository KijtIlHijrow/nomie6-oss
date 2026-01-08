# AI Query Setup for Nomie

This guide will help you set up local AI functionality in Nomie using Ollama.

## Prerequisites

- Docker and Docker Compose installed
- At least 4GB of free RAM (8GB+ recommended for larger models)

## Setup Steps

### 1. Start Ollama Service

The Ollama service is already configured in `docker-compose.yml`. Start it with:

```bash
docker-compose up -d ollama
```

Or start all services:

```bash
docker-compose up -d
```

### 2. Install an AI Model

Once Ollama is running, you need to pull a model. Here are some recommended models:

**Small & Fast (Good for quick queries):**
```bash
docker exec -it nomie-ollama ollama pull llama3.2
```

**Medium (Better quality, slower):**
```bash
docker exec -it nomie-ollama ollama pull llama3.1:8b
```

**Large (Best quality, requires more RAM):**
```bash
docker exec -it nomie-ollama ollama pull llama3.1:70b
```

**Alternative models:**
- `mistral` - Fast and efficient
- `phi3` - Microsoft's small model
- `gemma2` - Google's model

### 3. Verify Setup

Check that Ollama is running and has models:

```bash
docker exec -it nomie-ollama ollama list
```

You should see your installed models listed.

### 4. Access AI Query in Nomie

1. Start the Nomie development server:
   ```bash
   npm run dev
   ```

2. Navigate to the "AI Query" page in the sidebar (sparkles icon)

3. Select your model from the dropdown

4. Ask questions like:
   - "How was my usual anxiety level when I slept for only 6 hours?"
   - "What's my average mood on weekends?"
   - "Show me patterns in my sleep and energy levels"

## Troubleshooting

### Ollama not available

If you see "Ollama is not available":

1. Check if the container is running:
   ```bash
   docker ps | grep ollama
   ```

2. Check logs:
   ```bash
   docker logs nomie-ollama
   ```

3. Restart the service:
   ```bash
   docker-compose restart ollama
   ```

### Model not found

If you get an error about the model not being found:

1. List available models:
   ```bash
   docker exec -it nomie-ollama ollama list
   ```

2. Pull the model if it's not listed:
   ```bash
   docker exec -it nomie-ollama ollama pull llama3.2
   ```

3. Update the default model in `src/domains/ai-query/ai-query-service.ts` if needed

### Slow responses

- Try a smaller model (llama3.2 instead of llama3.1:70b)
- Reduce the date range in the query (currently set to 90 days)
- Check your system resources: `docker stats nomie-ollama`

## How It Works

1. **Question Parsing**: The system extracts relevant information from your question (tracker names, time ranges, conditions)

2. **Data Gathering**: It queries your Nomie logs and trackers from the last 90 days

3. **Context Building**: Creates a summary of your tracking data including:
   - Available trackers and their types
   - Usage statistics (counts, averages)
   - Sample log entries

4. **AI Analysis**: Sends the context and question to Ollama, which analyzes the data and provides insights

## Customization

### Change the default model

Edit `src/domains/ai-query/ai-query-service.ts`:

```typescript
const DEFAULT_MODEL = 'your-model-name'
```

### Adjust date range

In `getRelevantData()` function, change:

```typescript
const start = end.subtract(90, 'days').startOf('day')
```

### Change Ollama endpoint

If Ollama is running on a different host/port:

```typescript
const OLLAMA_ENDPOINT = 'http://your-host:11434/api/generate'
```

## Privacy

All AI processing happens locally on your machine. No data is sent to external services. Your tracking data never leaves your device.

