# Solution Hmad - Admin Panel

Système de gestion centralisée pour plusieurs boutiques avec gestion de stock, ventes, clients, fournisseurs, chèques, transferts et commandes.

## 🚀 Fonctionnalités

### ✅ Modules Disponibles

1. **Tableau de bord** - Vue d'ensemble des statistiques
2. **Gestion du Stock** - CRUD complet des produits (nom, référence, quantité, prix, fournisseur, catégorie)
3. **Gestion des Ventes** - Enregistrement des ventes avec paiements multiples
4. **Gestion des Clients** - Suivi des clients et soldes
5. **Gestion des Fournisseurs** - Suivi des fournisseurs et paiements
6. **Gestion des Chèques** - Enregistrement, suivi et encaissement des chèques
7. **Transferts de Caisse** - Transferts entre boutiques avec validation admin
8. **Commandes Inter-Boutiques** - Gestion des commandes entre boutiques
9. **Gestion des Utilisateurs** - Création d'utilisateurs avec rôles et permissions

### 🔐 Authentification et Sécurité

- Authentification Supabase avec JWT
- Gestion des rôles (Admin / User)
- Protection des routes avec middleware
- Toutes les données stockées dans Supabase (aucun stockage local)

## 📋 Configuration Initiale

### 1. Créer le premier compte administrateur

Utilisez l'un des moyens suivants pour créer votre premier compte admin:

**Option A: Via cURL**
```bash
curl -X POST \
  https://[PROJECT_ID].supabase.co/functions/v1/super-handler/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hmad.com",
    "password": "admin123",
    "name": "Administrateur Principal",
    "role": "admin",
    "boutique": "Admin"
  }'
```

**Option B: Via Postman ou tout client HTTP**
- URL: `https://[PROJECT_ID].supabase.co/functions/v1/super-handler/auth/signup`
- Method: POST
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "email": "admin@hmad.com",
  "password": "admin123",
  "name": "Administrateur Principal",
  "role": "admin",
  "boutique": "Admin"
}
```

### 2. Se connecter

Après avoir créé le compte, connectez-vous avec:
- **Email**: admin@hmad.com
- **Mot de passe**: admin123

## 🏗️ Architecture Technique

### Backend (Supabase Edge Functions)
- **Serveur**: Hono (Deno runtime)
- **Base de données**: PostgreSQL via KV Store
- **Authentification**: Supabase Auth
- **API**: REST avec JWT

### Frontend
- **Framework**: React
- **UI**: Tailwind CSS + ShadCN/UI
- **State**: React Hooks
- **HTTP Client**: Fetch API

### Endpoints API Disponibles

#### Authentification
- `POST /auth/signup` - Créer un utilisateur

#### Produits
- `GET /products` - Liste des produits
- `POST /products` - Ajouter un produit
- `PUT /products/:id` - Modifier un produit
- `DELETE /products/:id` - Supprimer un produit

#### Ventes
- `GET /sales` - Liste des ventes
- `POST /sales` - Créer une vente

#### Clients
- `GET /clients` - Liste des clients
- `POST /clients` - Ajouter un client
- `PUT /clients/:id` - Modifier un client
- `DELETE /clients/:id` - Supprimer un client

#### Fournisseurs
- `GET /suppliers` - Liste des fournisseurs
- `POST /suppliers` - Ajouter un fournisseur
- `PUT /suppliers/:id` - Modifier un fournisseur
- `DELETE /suppliers/:id` - Supprimer un fournisseur

#### Chèques
- `GET /checks` - Liste des chèques
- `POST /checks` - Ajouter un chèque
- `PUT /checks/:id` - Mettre à jour le statut

#### Transferts
- `GET /transfers` - Liste des transferts
- `POST /transfers` - Créer un transfert
- `PUT /transfers/:id/validate` - Valider/rejeter un transfert (Admin)

#### Commandes
- `GET /orders` - Liste des commandes
- `POST /orders` - Créer une commande
- `PUT /orders/:id` - Mettre à jour une commande

#### Utilisateurs
- `GET /users` - Liste des utilisateurs
- `PUT /users/:id` - Modifier un utilisateur

#### Statistiques
- `GET /stats` - Statistiques du tableau de bord

## 📊 Modèle de Données

Tous les objets sont stockés dans le KV Store avec les préfixes suivants:

- `product:*` - Produits
- `sale:*` - Ventes
- `client:*` - Clients
- `supplier:*` - Fournisseurs
- `check:*` - Chèques
- `transfer:*` - Transferts
- `order:*` - Commandes
- `user:*` - Utilisateurs
- `stock_movement:*` - Mouvements de stock
- `payment:*` - Paiements

## 🎯 Utilisation

### Créer un produit
1. Aller dans l'onglet "Stock"
2. Cliquer sur "Ajouter un produit"
3. Remplir les informations (nom, référence, quantité, prix, etc.)
4. Enregistrer

### Enregistrer une vente
1. Aller dans l'onglet "Ventes"
2. Cliquer sur "Nouvelle vente"
3. Sélectionner les produits et quantités
4. Choisir le mode de paiement
5. Enregistrer (le stock sera automatiquement mis à jour)

### Valider un transfert (Admin)
1. Aller dans l'onglet "Transferts"
2. Voir les transferts en attente
3. Cliquer sur ✓ pour approuver ou ✗ pour rejeter

### Créer un utilisateur
1. Aller dans l'onglet "Utilisateurs"
2. Cliquer sur "Créer un utilisateur"
3. Remplir email, mot de passe, nom, rôle et boutique
4. Enregistrer

## 🔄 Workflow Typique

1. **Admin** crée les produits dans le stock
2. **Utilisateurs boutique** enregistrent les ventes
3. **Utilisateurs boutique** créent des transferts de caisse en fin de journée
4. **Admin** valide les transferts
5. **Boutiques** passent des commandes entre elles
6. **Admin** supervise toute l'activité via le tableau de bord

## 🛡️ Sécurité

- ✅ Authentification requise sur toutes les routes
- ✅ Tokens JWT pour la sécurité
- ✅ Validation côté serveur
- ✅ Pas de stockage local sensible
- ✅ CORS configuré
- ✅ Logs d'erreur détaillés

## 📱 Responsive

L'interface est responsive et s'adapte aux écrans:
- Desktop (1920px+)
- Laptop (1024px+)
- Tablet (768px+)
- Mobile (320px+)

## 🌐 Déploiement

L'application est prête pour la production:
- Backend déployé sur Supabase Edge Functions
- Frontend peut être déployé sur Vercel, Netlify, ou tout hébergeur statique
- Base de données PostgreSQL gérée par Supabase

## 📞 Support

Pour toute question ou problème:
1. Vérifier que Supabase est bien configuré
2. Vérifier que le premier admin a été créé
3. Consulter les logs du serveur dans Supabase Dashboard

## 🚧 Évolutions Futures

- Export PDF/Excel des rapports
- Statistiques avancées avec graphiques
- Notifications en temps réel
- Application mobile native
- Support multilingue (FR/AR)
- Gestion des photos pour les produits et chèques
- Intégration avec des API de paiement

---

**Version**: 1.0.0  
**Date**: Novembre 2024  
**Entreprise**: Tech Ventures  
**Direction**: Anas Taifi
