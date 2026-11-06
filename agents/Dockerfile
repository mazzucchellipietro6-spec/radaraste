# Servizio agenti WHITE CARRARA. Da costruire dalla radice del repository:
#   docker build -f agents/Dockerfile -t white-carrara-agents .
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY agents/requirements.txt agents/requirements.txt
RUN pip install --no-cache-dir -r agents/requirements.txt
COPY agents agents
# catalogo pubblico dei marmi, letto dallo strumento catalog_search
COPY src/content/marbles src/content/marbles
WORKDIR /app/agents
RUN useradd --system --uid 10001 agents
USER agents
EXPOSE 8787
CMD ["python", "-m", "wc_agents", "serve", "--port", "8787"]
