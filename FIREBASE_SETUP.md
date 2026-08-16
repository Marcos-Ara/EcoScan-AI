# Firebase no EcoScan AI

1. Abra seu projeto no Firebase Console.
2. Em Authentication > Sign-in method, ative E-mail/Senha e, se quiser, Google.
3. Em Configurações do projeto > Seus apps > Web, copie o objeto de configuração.
4. Cole os valores em `frontend/config.js`.
5. Em Authentication > Settings > Authorized domains, adicione o domínio usado pelo frontend.
6. Para produção, crie uma credencial do Firebase Admin e configure-a apenas no backend. Nunca copie essa credencial para o frontend.
