// Substitua pelos dados do SEU projeto Firebase (Console Firebase > Configurações do projeto > Seus apps > Config).
// Essas chaves são públicas por natureza (o Firebase é protegido pelas Regras de Segurança, não por esconder essa config).
export const firebaseConfig = {
  apiKey: "AIzaSyAX6jVwtkfuJAGHBUkbt2XJZWwPus8zjZs",
  authDomain: "rengar-51a0a.firebaseapp.com",
  projectId: "rengar-51a0a",
  storageBucket: "rengar-51a0a.firebasestorage.app",
  messagingSenderId: "689014351346",
  appId: "1:689014351346:web:116297250ef83a0729b76b"
};

// E-mails autorizados a acessar o painel de admin (o do seu amigo + o seu).
// Isso é só a primeira camada (esconde o botão/rota); a proteção de verdade
// está nas Regras de Segurança do Firestore — veja o README.
export const ADMIN_EMAILS = [
  "vinicios.felipe93@gmail.com",
  "marlon.moreno@gmail.com",
  // adicione aqui o e-mail do seu amigo
];
