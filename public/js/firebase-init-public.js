// Init do Firebase só com Firestore, pras páginas públicas (index/matchup/guide).
// Essas páginas só leem dados — nunca autenticam ninguém — então não faz
// sentido baixar e inicializar o SDK de Auth aqui (isso fica em firebase-init.js,
// usado só pelo /admin). Mesmo projeto/config, mesmo Firestore, só menos JS
// desnecessário no carregamento das páginas públicas.
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export { collection, doc, getDocs, getDoc, query, orderBy };
