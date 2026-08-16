# EcoScan AI — base integrada

Esta versão junta a interface do projeto EcoScan com a lógica de detecção local da primeira versão, usando IA executada no navegador.

## Arquitetura

- **Frontend:** HTML/CSS/JavaScript.
- **IA no navegador:** TensorFlow.js + COCO-SSD. A câmera e a imagem enviada são analisadas localmente.
- **Autenticação:** Firebase Authentication.
- **Banco:** PostgreSQL.
- **API:** FastAPI + psycopg.
- **EcoPontos:** Leaflet + OpenStreetMap, com consulta de locais de reciclagem/descarte via Overpass.

## Teste mais rápido

1. Instale Docker Desktop.
2. Na raiz do projeto, execute `docker compose up --build`.
3. O PostgreSQL ficará em `localhost:5432` e a API em `http://127.0.0.1:8000`.
4. No `frontend/config.js`, cole o `firebaseConfig` do seu aplicativo Web do Firebase.
5. Abra `frontend/index.html` usando o Live Server do VS Code.
6. No Firebase Authentication, habilite E-mail/Senha e Google conforme o método desejado.

### Sem Docker

Crie um PostgreSQL local, rode `database/schema.sql`, configure `DATABASE_URL`, instale `backend/requirements.txt` e execute `uvicorn app:app --reload --port 8000`.

## Firebase

O frontend usa o Firebase Authentication. Para desenvolvimento local, o backend aceita `DEV_MODE=true` e registra as detecções como `dev-user`. Em produção, desative `DEV_MODE` e configure o Firebase Admin no backend com `FIREBASE_SERVICE_ACCOUNT_JSON` ou `FIREBASE_SERVICE_ACCOUNT_FILE`, para que o token enviado pelo navegador seja validado de verdade.

## Conquistas

As detecções salvas geram 10 pontos cada. Há conquistas por quantidade de scans e uma conquista para a primeira busca de EcoPonto.

## Criadores

Edite `frontend/creators.js`. Cada integrante pode ter nome, função e link do GitHub.

## Limitação importante da IA

COCO-SSD reconhece objetos comuns, não é um classificador especializado em resíduos. A regra de descarte é uma camada de mapeamento por objeto e mostra "Indeterminado" quando não houver segurança suficiente. Para uma versão realmente especializada em tipos de lixo, a evolução natural é treinar/embutir um classificador próprio de resíduos.
