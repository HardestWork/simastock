# Guide Utilisateur — Systeme de Gestion Commerciale

> Documentation complete destinee aux utilisateurs de la plateforme.
> Version : Mars 2026

---

## Table des matieres

1. [Presentation generale](#1-presentation-generale)
2. [Premiers pas](#2-premiers-pas)
3. [Tableau de bord](#3-tableau-de-bord)
4. [Catalogue produits](#4-catalogue-produits)
5. [Gestion du stock](#5-gestion-du-stock)
6. [Point de vente (POS)](#6-point-de-vente-pos)
7. [Devis et factures proforma](#7-devis-et-factures-proforma)
8. [Caisse et encaissements](#8-caisse-et-encaissements)
9. [Gestion des clients](#9-gestion-des-clients)
10. [Credits et echeanciers](#10-credits-et-echeanciers)
11. [Remboursements et avoirs](#11-remboursements-et-avoirs)
12. [Fournisseurs et achats](#12-fournisseurs-et-achats)
13. [Gestion des depenses](#13-gestion-des-depenses)
14. [Alertes et notifications](#14-alertes-et-notifications)
15. [Rapports et statistiques](#15-rapports-et-statistiques)
16. [Analytics avancees](#16-analytics-avancees)
17. [Objectifs et performance vendeurs](#17-objectifs-et-performance-vendeurs)
18. [CRM Commercial](#18-crm-commercial)
19. [Gestion des ressources humaines (GRH)](#19-gestion-des-ressources-humaines-grh)
20. [Administration et parametres](#20-administration-et-parametres)
21. [Verification de documents](#21-verification-de-documents)
22. [Roles et droits d'acces](#22-roles-et-droits-dacces)
23. [Questions frequentes (FAQ)](#23-questions-frequentes-faq)

---

## 1. Presentation generale

### Qu'est-ce que le Systeme de Gestion Commerciale ?

Le **Systeme de Gestion Commerciale** est une plateforme complete qui permet de gerer l'ensemble de votre activite commerciale :

- **Ventes** : creer des ventes, emettre des factures et des recus
- **Stock** : suivre vos niveaux de stock en temps reel, faire des inventaires
- **Caisse** : gerer les encaissements, ouvrir/fermer des sessions de caisse
- **Clients** : fiche client, historique d'achats, gestion du credit
- **Achats** : bons de commande fournisseurs, receptions de marchandises
- **Depenses** : suivi des depenses, budgets mensuels
- **Analytics** : tableaux de bord intelligents, previsions, alertes
- **Equipe** : objectifs vendeurs, performance caissiers, classements
- **CRM** : pipeline commercial, prospects, opportunites
- **RH** : employes, conges, paie, evaluations

### Organisation : Entreprise et Magasins

La plateforme fonctionne sur un modele **multi-magasins** :

- **Entreprise** : votre societe (ex: "Ma Societe SARL")
  - **Magasin 1** : par exemple "Magasin Akwa"
  - **Magasin 2** : par exemple "Magasin Bonanjo"
  - etc.

Chaque magasin a son propre stock, ses propres ventes, ses sessions de caisse et ses alertes. Les produits, les clients et les fournisseurs sont partages au niveau de l'entreprise.

---

## 2. Premiers pas

### 2.1 Connexion

1. Ouvrez votre navigateur et accedez a l'adresse fournie par votre administrateur
2. Entrez votre **adresse email** et votre **mot de passe**
3. Cliquez sur **Se connecter**

> Si vous avez oublie votre mot de passe, cliquez sur **Mot de passe oublie** et suivez les instructions envoyees par email.

### 2.2 Changer de magasin

Si vous avez acces a plusieurs magasins :

1. Cliquez sur le **nom du magasin** affiche en haut de la barre laterale
2. Selectionnez le magasin souhaite dans la liste

Toutes les donnees affichees (ventes, stock, caisse) seront celles du magasin selectionne.

### 2.3 Navigation

La barre laterale gauche donne acces a toutes les sections :

| Icone | Section | Description |
|-------|---------|-------------|
| Tableau de bord | Accueil | Vue d'ensemble de votre activite |
| Point de vente | POS | Creer et gerer les ventes |
| Devis | Devis | Creer devis et proformas |
| Catalogue | Produits | Gerer les produits, categories, marques |
| Stock | Stock | Niveaux, mouvements, transferts |
| Caisse | Caisse | Sessions et encaissements |
| Clients | Clients | Fiche client et credits |
| Achats | Achats | Fournisseurs et bons de commande |
| Depenses | Depenses | Suivi des depenses |
| Alertes | Alertes | Notifications et alertes |
| Rapports | Rapports | Statistiques et exports |
| Parametres | Parametres | Configuration du magasin |

> Les sections visibles dependent de votre role et des modules actives pour votre magasin.

### 2.4 Mon profil

Pour modifier vos informations personnelles :

1. Cliquez sur votre **nom** en haut a droite
2. Selectionnez **Mon profil**
3. Modifiez vos informations (nom, prenom, telephone)
4. Cliquez sur **Enregistrer**

Pour changer votre mot de passe :

1. Allez dans **Mon profil**
2. Cliquez sur **Changer le mot de passe**
3. Entrez votre ancien mot de passe, puis le nouveau (2 fois)
4. Validez

---

## 3. Tableau de bord

Le tableau de bord affiche un resume de votre activite :

### Indicateurs cles (KPIs)

- **Chiffre d'affaires** : total des ventes sur la periode
- **Nombre de ventes** : nombre de transactions
- **Panier moyen** : montant moyen par vente
- **Marge brute** : difference entre prix de vente et prix d'achat
- **Remises accordees** : total des remises sur la periode
- **Remboursements** : total des avoirs emis
- **Ventes nettes** : CA apres remises et remboursements
- **Encours credit** : montant total des credits clients en cours
- **Valeur du stock** : valeur totale du stock au prix d'achat

### Graphiques

- **Tendance des ventes** : evolution quotidienne/mensuelle du CA
- **Top produits** : les produits les plus vendus
- **Repartition par mode de paiement** : especes, mobile money, virement, etc.

### Filtres

Vous pouvez filtrer par :
- **Periode** : aujourd'hui, cette semaine, ce mois, personnalise
- **Magasin** : si vous avez acces a plusieurs magasins

---

## 4. Catalogue produits

### 4.1 Consulter les produits

Menu : **Catalogue** > **Produits**

La liste affiche tous les produits de votre entreprise avec :
- Nom, reference (SKU), code-barres
- Categorie et marque
- Prix d'achat et prix de vente
- Statut (actif/inactif)

**Recherche** : utilisez la barre de recherche pour trouver un produit par nom, SKU ou code-barres.

**Filtres** : filtrez par categorie, marque ou statut.

### 4.2 Creer un produit

1. Cliquez sur **Nouveau produit**
2. Remplissez les champs :
   - **Nom** : nom du produit
   - **Reference (SKU)** : code unique interne
   - **Code-barres** : code EAN/UPC (optionnel)
   - **Categorie** : selectionnez ou creez une categorie
   - **Marque** : selectionnez ou creez une marque (optionnel)
   - **Type** : Produit physique ou Service
   - **Prix d'achat** : votre cout
   - **Prix de vente** : prix affiche au client
   - **Suivi de stock** : cochez si vous voulez suivre les quantites
3. Ajoutez des images (optionnel)
4. Cliquez sur **Enregistrer**

### 4.3 Importer des produits en masse

Pour ajouter beaucoup de produits d'un coup :

1. Allez dans **Catalogue** > **Produits**
2. Cliquez sur **Importer CSV**
3. Telechargez le modele CSV
4. Remplissez le fichier avec vos produits
5. Importez le fichier

### 4.4 Exporter les produits

1. Cliquez sur **Exporter CSV** pour telecharger la liste complete de vos produits au format tableur

### 4.5 Categories et marques

Menu : **Catalogue** > **Categories** / **Marques**

- Creez des categories pour organiser vos produits (ex: Telephones, Accessoires, Cables)
- Les categories peuvent etre hierarchiques (categorie parente > sous-categorie)
- Les marques permettent de filtrer par fabricant

---

## 5. Gestion du stock

### 5.1 Niveaux de stock

Menu : **Stock** > **Niveaux de stock**

Cette page affiche pour chaque produit :
- **Quantite en stock** : quantite physique
- **Quantite reservee** : quantite bloquee pour des ventes en cours
- **Quantite disponible** : quantite libre a la vente
- **Seuil minimum** : en dessous, une alerte est generee

### 5.2 Entree de stock

Pour enregistrer une reception de marchandises :

1. Menu : **Stock** > **Entree de stock**
2. Selectionnez les produits et les quantites recues
3. Indiquez une reference (ex: numero du bon de livraison)
4. Validez

Le stock est immediatement mis a jour.

### 5.3 Ajustement de stock

Pour corriger des ecarts (perte, casse, erreur de comptage) :

1. Menu : **Stock** > **Ajustement**
2. Selectionnez le produit
3. Entrez la quantite (positive pour ajouter, negative pour retirer)
4. Indiquez une raison
5. Validez

### 5.4 Transferts inter-magasins

Pour transferer du stock d'un magasin a un autre :

1. Menu : **Stock** > **Transferts**
2. Cliquez sur **Nouveau transfert**
3. Selectionnez le **magasin de destination**
4. Ajoutez les produits et quantites a transferer
5. Cliquez sur **Creer**

**Flux du transfert** :
- `En attente` → Un manager approuve → `Expedie` → Le magasin de destination recoit → `Recu`

### 5.5 Inventaire physique

Pour faire un comptage physique du stock :

1. Menu : **Stock** > **Inventaires**
2. Cliquez sur **Nouvel inventaire**
3. Le systeme charge automatiquement tous les produits avec les quantites theoriques
4. Saisissez les **quantites comptees** pour chaque produit
5. Le systeme calcule les **ecarts** (variance)
6. Validez l'inventaire pour appliquer les corrections au stock

### 5.6 Historique des mouvements

Menu : **Stock** > **Mouvements**

Consultez l'historique complet de tous les mouvements de stock :
- Entrees, sorties (ventes), ajustements, transferts, retours
- Filtrez par produit, type de mouvement ou periode

### 5.7 Analytics stock

Menu : **Stock** > **Analytics**

Dashboard dedie au stock avec :
- **Score de sante** : note globale de votre gestion de stock
- **Rotation** : produits a forte/faible rotation
- **Stock dormant** : produits sans vente depuis 90+ jours
- **Risque de rupture** : prevision de rupture avec niveau d'urgence
- **Ajustements suspects** : mouvements inhabituels a verifier

---

## 6. Point de vente (POS)

### 6.1 Creer une vente

1. Menu : **Point de vente** > **Nouvelle vente**
2. **Selectionnez un client** (optionnel) : recherchez par nom ou telephone
3. **Ajoutez des articles** :
   - Recherchez par nom, SKU ou code-barres
   - Cliquez sur le produit pour l'ajouter
   - Modifiez la quantite si necessaire
4. **Appliquez une remise** (optionnel) :
   - Remise en pourcentage sur le total
   - Remise fixe par article
5. Cliquez sur **Soumettre en caisse**

La vente passe en statut **En attente de paiement** et apparait dans la file d'attente du caissier.

### 6.2 Modifier une vente en brouillon

Tant que la vente est en statut **Brouillon** (non soumise) :
- Ajoutez ou supprimez des articles
- Modifiez les quantites et les prix unitaires
- Changez le client

### 6.3 Annuler une vente

Un **Manager** ou **Admin** peut annuler une vente :
1. Ouvrez la vente
2. Cliquez sur **Annuler**
3. Si le stock avait ete decremente, il est automatiquement re-introduit

### 6.4 Consulter les ventes

Menu : **Point de vente**

La liste affiche toutes les ventes avec :
- Numero de facture (FAC-XXX-XXXX-XXXXX)
- Client, vendeur, date
- Montant total et statut
- Statut de paiement (Impaye, Partiel, Paye)

**Filtres disponibles** : statut, vendeur, client, vente a credit, periode

### 6.5 Telecharger des documents

Depuis le detail d'une vente :
- **Facture** : document fiscal complet en PDF
- **Recu** : ticket de caisse format reduit

### 6.6 Exporter les ventes

Cliquez sur **Exporter CSV** pour telecharger la liste des ventes au format tableur.

---

## 7. Devis et factures proforma

### 7.1 Types de documents

Le systeme gere deux types de documents :
- **Devis** : proposition de prix (numerotation DEV-XXX)
- **Facture proforma** : facture provisoire avant paiement (numerotation PRO-XXX)

### 7.2 Creer un devis ou une proforma

1. Menu : **Devis** > **Nouveau**
2. Choisissez le **type de document** : Devis ou Proforma
3. Selectionnez un **client** (optionnel)
4. Ajoutez des **articles** avec quantites et prix
5. Definissez la **date de validite**
6. Ajoutez des **conditions** et **notes** (optionnel)
7. Cliquez sur **Creer**

### 7.3 Cycle de vie d'un devis

```
Brouillon → Envoye → Accepte → Converti en vente
                   → Refuse
         → Annule (a tout moment avant conversion)
```

**Actions possibles** :

| Action | Qui | Description |
|--------|-----|-------------|
| Envoyer | Vendeur | Marque comme envoye au client |
| Accepter | Manager | Le client a accepte le devis |
| Refuser | Manager | Le client a refuse (avec raison) |
| Convertir | Manager | Cree automatiquement une vente avec les memes articles |
| Annuler | Manager | Annule le devis (avec raison obligatoire) |
| Dupliquer | Vendeur | Copie le devis pour un nouveau client |

### 7.4 Telecharger le PDF

Depuis le detail du devis, cliquez sur **Telecharger PDF**. Le titre du document sera automatiquement :
- **DEVIS** pour un devis
- **FACTURE PROFORMA** pour une proforma

### 7.5 Convertir en vente

Lorsqu'un devis est accepte :
1. Ouvrez le devis
2. Cliquez sur **Convertir en vente**
3. Une vente est automatiquement creee avec les memes articles et prix
4. Le devis passe en statut **Converti** et affiche le lien vers la vente

---

## 8. Caisse et encaissements

### 8.1 Ouvrir une session de caisse

Avant de pouvoir encaisser :

1. Menu : **Caisse**
2. Cliquez sur **Ouvrir la caisse**
3. Entrez le **fond de caisse** (montant en especes au demarrage)
4. Validez

### 8.2 Encaisser une vente

1. Les ventes **en attente de paiement** apparaissent dans votre file d'attente
2. Selectionnez une vente
3. Choisissez le(s) **mode(s) de paiement** :
   - **Especes**
   - **Mobile Money** (avec reference de transaction)
   - **Virement bancaire** (avec reference)
   - **Cheque**
   - **Credit** (vente a credit)
4. Vous pouvez combiner plusieurs modes (paiement mixte)
5. Validez le paiement

Quand le montant total est couvert :
- La vente passe en statut **Paye**
- Le stock est decremente (selon la configuration du magasin)
- Le recu est disponible

Si le paiement est partiel :
- La vente passe en statut **Partiellement paye**
- Le solde restant est affiche

### 8.3 Fermer la session de caisse

En fin de journee :

1. Cliquez sur **Fermer la caisse**
2. Comptez vos especes et entrez le **montant reel en caisse**
3. Ajoutez des **notes** si necessaire (ex: billets manquants)
4. Validez

Le systeme calcule automatiquement :
- **Especes attendues** : fond de caisse + encaissements especes
- **Ecart** : difference entre montant reel et montant attendu
- **Totaux par mode de paiement**

### 8.4 Rapport de session

Apres la fermeture, vous pouvez telecharger le **rapport de session** en PDF. Ce rapport detaille toutes les operations effectuees pendant la session.

### 8.5 Analytics caissier

Menu : **Caisse** > **Mes analytics**

Dashboard personnel du caissier :
- **Score de fiabilite** : note sur 100 basee sur la precision et les ecarts
- **KPIs** : nombre de transactions, montant encaisse, ecarts cumules
- **Anomalies** : alertes si ecarts repetes ou montants inhabituels
- **Repartition par mode de paiement**
- **Historique des sessions**

---

## 9. Gestion des clients

### 9.1 Liste des clients

Menu : **Clients**

La liste affiche tous les clients de votre entreprise :
- Nom, prenom, telephone, email
- Societe (pour les clients B2B)

**Recherche** : par nom, prenom ou telephone.

### 9.2 Creer un client

1. Cliquez sur **Nouveau client**
2. Remplissez les informations :
   - **Nom** et **Prenom** (obligatoires)
   - **Telephone** (recommande)
   - **Email**, **Adresse**, **Societe** (optionnels)
3. Enregistrez

> Un client par defaut ("Client comptoir") est cree automatiquement pour les ventes sans client identifie.

### 9.3 Fiche client

La fiche client affiche :
- Informations personnelles
- **Historique d'achats** : toutes les ventes associees
- **Compte credit** : solde, limite, echeancier (si module credit actif)
- **Score client** : notation basee sur le comportement d'achat (si analytics active)

### 9.4 Importer / Exporter

- **Importer CSV** : ajoutez des clients en masse via un fichier tableur
- **Exporter CSV** : telechargez la liste complete de vos clients

### 9.5 Intelligence client

Menu : **Clients** > **Intelligence**

Si le module est active, vous accedez a :
- **Top clients** du mois : vos meilleurs acheteurs
- **Clients dormants** : pas d'achat depuis longtemps
- **Risque de perte** : clients qui pourraient ne plus revenir
- **Risque credit** : clients avec des paiements en retard
- **Score individuel** : notation globale de chaque client
- **Recommandations** : produits a proposer a chaque client
- **Prediction** : estimation de la prochaine commande

---

## 10. Credits et echeanciers

### 10.1 Comptes credit

Menu : **Credits**

Un compte credit permet a un client d'acheter maintenant et de payer plus tard.

**Pour chaque compte, vous voyez** :
- **Limite de credit** : montant maximum autorise
- **Solde** : montant actuellement du par le client
- **Credit disponible** : marge restante avant la limite
- **Statut** : actif ou bloque

### 10.2 Creer un compte credit

1. Cliquez sur **Nouveau compte**
2. Selectionnez le **client**
3. Definissez la **limite de credit** (ex: 500 000 FCFA)
4. Activez le compte

### 10.3 Vente a credit

Lors d'une vente, si le client a un compte credit :
1. Le caissier selectionne **Credit** comme mode de paiement
2. Le montant est ajoute au solde du compte credit du client
3. Un echeancier peut etre cree pour planifier les paiements

### 10.4 Enregistrer un paiement credit

1. Ouvrez le compte credit du client
2. Cliquez sur **Enregistrer un paiement**
3. Entrez le montant et le mode de paiement
4. Un recu de paiement est genere

### 10.5 Echeanciers

Pour les gros montants, vous pouvez creer un echeancier :
- Plusieurs echeances avec dates et montants
- Suivi automatique du statut : En attente, Partiel, Paye, En retard
- Alertes automatiques en cas de retard

### 10.6 Releve de compte

Depuis la fiche du compte credit :
- **Releve JSON** : historique complet des operations
- **Releve PDF** : document imprimable pour le client

---

## 11. Remboursements et avoirs

### 11.1 Creer un remboursement

1. Ouvrez la vente concernee
2. Cliquez sur **Rembourser**
3. Renseignez :
   - **Montant** : total ou partiel
   - **Raison** : motif du remboursement
   - **Mode** : especes, mobile money, virement
   - **Remettre en stock** : cochez si les articles doivent revenir en stock
4. Validez

### 11.2 Avoir (note de credit)

Chaque remboursement genere automatiquement un **numero d'avoir** (AVO-XXX-XXXX-XXXXX) pour la tracabilite comptable.

### 11.3 Impact sur le stock

Si vous cochez **Remettre en stock**, les quantites sont automatiquement re-introduites dans le stock du magasin.

---

## 12. Fournisseurs et achats

### 12.1 Gestion des fournisseurs

Menu : **Achats** > **Fournisseurs**

Creez et gerez vos fournisseurs :
- Nom, contact, telephone, email, adresse

### 12.2 Bons de commande

Menu : **Achats** > **Bons de commande**

**Creer un bon de commande** :
1. Cliquez sur **Nouveau BC**
2. Selectionnez le **fournisseur**
3. Ajoutez les **produits** avec quantites et prix unitaires
4. Cliquez sur **Creer** (brouillon) ou **Creer et soumettre**

**Cycle de vie** :
```
Brouillon → Soumis → Partiellement recu → Recu
                   → Annule
```

### 12.3 Reception de marchandises

Quand les produits arrivent :

1. Ouvrez le bon de commande
2. Cliquez sur **Recevoir**
3. Pour chaque ligne, indiquez la **quantite effectivement recue**
4. Validez

Le stock est automatiquement mis a jour avec les quantites recues.

> Vous pouvez faire des receptions partielles : recevoir une partie maintenant et le reste plus tard.

---

## 13. Gestion des depenses

### 13.1 Enregistrer une depense

Menu : **Depenses**

1. Cliquez sur **Nouvelle depense**
2. Remplissez :
   - **Categorie** : loyer, transport, fournitures, etc.
   - **Portefeuille** : d'ou provient l'argent (caisse, banque, mobile money)
   - **Montant**
   - **Description** et **Fournisseur** (optionnel)
   - **Date**
3. Validez

Le solde du portefeuille est automatiquement debite.

### 13.2 Annuler une depense

Si une depense a ete saisie par erreur :
1. Ouvrez la depense
2. Cliquez sur **Annuler**
3. Indiquez la raison
4. Le montant est re-credite au portefeuille

### 13.3 Categories de depenses

Menu : **Depenses** > **Parametres**

Creez des categories adaptees a votre activite :
- **Fixes** : loyer, salaires, abonnements
- **Variables** : transport, fournitures, reparations
- **Stock** : achats de marchandises (si non geres par les BC)

### 13.4 Portefeuilles

Gerez vos sources de financement :
- **Caisse** : especes disponibles
- **Banque** : compte bancaire
- **Mobile Money** : compte mobile money

### 13.5 Budgets mensuels

Definissez des limites de depenses par categorie et par mois :
1. Allez dans **Depenses** > **Parametres** > **Budgets**
2. Definissez un montant limite et un seuil d'alerte (ex: 80%)
3. Le dashboard vous previent quand vous approchez ou depassez le budget

### 13.6 Depenses recurrentes

Pour les depenses regulieres (loyer, abonnements) :
1. Creez une **depense recurrente**
2. Definissez la frequence (hebdomadaire, mensuelle)
3. Le systeme genere automatiquement la depense a la date prevue

### 13.7 Dashboard depenses

Menu : **Depenses** > **Dashboard**

Vue d'ensemble mensuelle :
- **Total depenses** du mois (avec comparaison mois precedent)
- **Repartition par categorie** et par portefeuille
- **Top 5 categories**
- **Ratio depenses/CA** : pourcentage du chiffre d'affaires consomme en depenses
- **Suivi budgetaire** : progression par rapport aux limites fixees

---

## 14. Alertes et notifications

Menu : **Alertes**

Le systeme genere automatiquement des alertes pour :

| Type | Description | Severite |
|------|-------------|----------|
| Stock bas | Un produit passe sous le seuil minimum | Attention |
| Rupture de stock | Un produit n'a plus de stock | Critique |
| Paiement en attente | Une vente attend l'encaissement depuis trop longtemps | Attention |
| Remise anormale | Une remise inhabituelle a ete detectee | Attention |
| Ecart de caisse | Un caissier a des ecarts repetes | Critique |
| Credit en retard | Un client n'a pas paye a l'echeance | Attention |
| Risque de rupture | Prevision de rupture dans les prochains jours | Attention |

**Actions** :
- Cliquez sur une alerte pour voir les details
- Marquez comme lue une fois traitee
- **Tout marquer comme lu** pour nettoyer la liste

---

## 15. Rapports et statistiques

Menu : **Rapports**

### 15.1 KPIs du tableau de bord

Vue synthetique : CA, nombre de ventes, panier moyen, marge, remises, remboursements, credit en cours, valeur stock.

### 15.2 Rapport de ventes

Rapport detaille avec filtres :
- Periode, vendeur, client
- Regroupement par jour, mois, annee
- Total, sous-totaux, moyennes

### 15.3 Rapport de caisse

Rapport PDF des operations de caisse sur une periode :
- Sessions ouvertes/fermees
- Totaux par mode de paiement
- Ecarts constates

### 15.4 Tendance stock

Evolution de la valeur du stock sur plusieurs mois.

### 15.5 Statistiques quotidiennes

Resume de l'activite du jour : ventes, paiements, mouvements de stock.

---

## 16. Analytics avancees

> Les analytics avancees sont un module optionnel. Contactez votre administrateur pour l'activer.

Menu : **Analytics** / **Statistiques**

### 16.1 KPIs strategiques

Vue manager avec indicateurs detailles : tendances, comparaisons inter-periodes, performances par vendeur.

### 16.2 Analyse ABC

Classification automatique des produits :
- **Classe A** : 20% des produits generant 80% du CA (critiques)
- **Classe B** : produits de contribution moyenne
- **Classe C** : produits a faible contribution

Permet de concentrer vos efforts sur les produits les plus importants.

### 16.3 Recommandations de reapprovisionnement

Le systeme analyse la vitesse de vente de chaque produit et recommande :
- **Quoi commander** : produits proches de la rupture
- **Combien** : quantite optimale basee sur l'historique
- **Quand** : urgence du reapprovisionnement

### 16.4 Previsions de ventes

Projection du chiffre d'affaires a venir basee sur les tendances historiques.

### 16.5 Score de credit client

Notation automatique des clients sur leur fiabilite de paiement :
- **A** : excellent payeur
- **B** : bon payeur
- **C** : moyen
- **D** : a surveiller
- **E** : risque eleve

### 16.6 Detection de fraude

Le systeme detecte automatiquement les anomalies :
- Remises anormalement elevees
- Annulations suspectes
- Ecarts de caisse repetes
- Patterns inhabituels

### 16.7 Dashboard Direction Generale

Menu : **DG** > **Dashboard**

Vue executive consolidee pour les dirigeants :
- **Score global** : note de performance de l'ensemble du magasin
- **Performance vendeurs** : score moyen, top 3 vendeurs
- **Performance caissiers** : score moyen, top 3 caissiers
- **Sante du stock** : score, ruptures, dormants
- **Revenus** : CA, taux d'encaissement, annulations
- **Alertes organisationnelles** : risques a traiter en priorite

---

## 17. Objectifs et performance vendeurs

> Module optionnel. Contactez votre administrateur.

### 17.1 Pour les vendeurs

Menu : **Objectifs** > **Mon objectif**

Votre tableau de bord personnel affiche :
- **Objectif du mois** : montant cible a atteindre
- **Progression** : pourcentage atteint et montant restant
- **Palier actuel** : Bronze, Argent, Or, Elite (selon votre performance)
- **Bonus estime** : prime prevue selon votre palier
- **Projection** : estimation de fin de mois basee sur votre rythme
- **Score 360** : note globale prenant en compte ventes, qualite, credit
- **Classement** : votre position par rapport aux autres vendeurs

**Sections supplementaires** :
- **Historique** : performance mois par mois sur l'annee
- **Badges** : recompenses gagnees (meilleur mois, sprint gagne, etc.)
- **Qualite credit** : taux de recouvrement de vos ventes a credit
- **Mix produits** : repartition de vos ventes par categorie
- **Coaching** : missions du jour pour ameliorer votre performance

### 17.2 Sprints de vente

Les managers peuvent creer des **sprints** (challenges temporaires) :
- Duree definie (ex: 3 jours, 1 semaine)
- Classement en temps reel
- Prix pour le(s) gagnant(s)

### 17.3 Pour les managers

Menu : **Objectifs** > **Administration**

- Definir les **regles d'objectifs** : paliers, seuils, bonus
- Consulter les **stats de tous les vendeurs**
- Gerer les **penalites** (deductions, plafonnements)
- Configurer le **classement** : visibilite (anonyme, par palier, complet)
- **Relancer le calcul** manuellement si necessaire

---

## 18. CRM Commercial

> Module optionnel pour la gestion B2B.

Menu : **Commercial**

### 18.1 Gestion des prospects

Suivez vos contacts commerciaux de la prospection a la conversion :
- **Creer un prospect** : nom, societe, telephone, source
- **Qualifier** : HOT (chaud), WARM (tiede), COLD (froid)
- **Convertir en client** quand le prospect est pret

### 18.2 Pipeline d'opportunites

Gerez vos affaires en cours dans un pipeline :

```
Prospection → Proposition → Negociation → Decision → Gagnee / Perdue
```

Pour chaque opportunite :
- Montant estime, probabilite de gain
- Client/prospect associe
- Lien vers un devis
- Activites et taches de suivi

### 18.3 Activites et taches

Enregistrez toutes vos actions commerciales :
- Appels, emails, visites, reunions
- Creez des taches de suivi avec dates d'echeance
- Marquez les taches comme terminees

### 18.4 Objectifs et primes commerciales

- **Objectifs mensuels** : cibles de CA par commercial
- **Politiques de primes** : definissez des paliers de bonus
- **Calcul automatique** : le systeme calcule les primes a verser
- **Approbation** : le manager valide avant paiement

### 18.5 Exports

Exportez vos donnees commerciales en CSV :
- Pipeline, activites, prospects, entonnoir de conversion

---

## 19. Gestion des ressources humaines (GRH)

> Module optionnel.

Menu : **GRH**

### 19.1 Employes

- Creer et gerer les fiches employes
- Informations personnelles, poste, departement
- Contrats de travail (CDD, CDI, etc.)
- Documents (pieces d'identite, diplomes, etc.)

### 19.2 Presence

- **Pointage quotidien** : arrivee, depart, heures supplementaires
- **Pointage en masse** : pour toute une equipe
- **Synthese mensuelle** : heures travaillees, retards, absences

### 19.3 Conges

- **Demande de conge** : l'employe soumet une demande
- **Approbation/refus** par le manager
- **Soldes de conges** : suivi automatique des jours restants
- **Types de conges** : annuels, maladie, exceptionnels, etc.

### 19.4 Paie

- **Periodes de paie** : mensuelle
- **Generation automatique** des bulletins de paie
- **Composantes salariales** : base, primes, deductions
- **Bulletin PDF** : telechargeable pour chaque employe
- **Cloture** : fige les bulletins en fin de mois

### 19.5 Evaluations

- **Modeles d'evaluation** avec criteres personnalises
- **Evaluations de performance** periodiques
- **Notation par critere** et score global
- **Accusé de reception** par l'employe evalue

### 19.6 Disciplinaire

Enregistrement des actions disciplinaires : avertissements, sanctions.

### 19.7 Jours feries

Definissez les jours feries applicables a votre entreprise.

---

## 20. Administration et parametres

Menu : **Parametres**

### 20.1 Parametres du magasin

- **Informations** : nom, adresse, telephone, email
- **Devise** : FCFA (par defaut)
- **TVA** : activer/desactiver, taux applicable
- **Logo** : logo affiche sur les factures

### 20.2 Parametres de facturation

- **En-tete** : texte affiche en haut des factures
- **Pied de page** : mentions legales, conditions
- **Conditions** : termes de vente par defaut
- **Template** : style de facture (Classique, Moderne, Simple)
- **Couleurs** : personnalisation des couleurs du document

### 20.3 Configuration du stock

- **Decrement stock a** :
  - **Au paiement** : le stock diminue quand la vente est payee (par defaut)
  - **A la validation** : le stock diminue des que la vente est soumise en caisse
- **Autoriser stock negatif** : permet de vendre meme si le stock affiche 0

### 20.4 Gestion des utilisateurs

Menu : **Parametres** > **Utilisateurs**

- Creer, modifier, activer/desactiver des utilisateurs
- Affecter un **role** et un **magasin**
- Reinitialiser le mot de passe d'un utilisateur

### 20.5 Roles personnalises

Menu : **Parametres** > **Roles**

Creez des roles sur mesure en choisissant un niveau de base :
- Ex: "Chef vendeur" base sur le role SALES avec des droits supplementaires

### 20.6 Permissions avancees

Menu : **Parametres** > **Permissions**

Si active, permet d'attribuer des **capacites specifiques** a chaque utilisateur au sein d'un magasin (ex: autoriser un vendeur a voir les rapports).

### 20.7 Modules

Menu : **Parametres** > **Modules** (SuperAdmin uniquement)

Activez ou desactivez les modules par magasin :
- POS, Caisse, Stock, Achats, Credit, Depenses, Alertes, Analytics, CRM, GRH, etc.

---

## 21. Verification de documents

Chaque facture, devis et recu genere contient un **QR code** ou un **lien de verification**.

Pour verifier l'authenticite d'un document :
1. Scannez le QR code ou entrez le lien dans un navigateur
2. La page affiche les informations du document original :
   - Type (facture, devis, recu)
   - Numero
   - Date
   - Magasin
   - Montant
3. Si les informations correspondent, le document est authentique

> Cette fonctionnalite est accessible **sans connexion** — utile pour les clients et partenaires.

---

## 22. Roles et droits d'acces

### Tableau des acces par role

| Fonctionnalite | Admin | Manager | Vendeur | Caissier | Magasinier |
|----------------|-------|---------|---------|----------|------------|
| Tableau de bord | Complet | Complet | Limite | Limite | Limite |
| Creer une vente | Oui | Oui | **Oui** | Non | Non |
| Soumettre en caisse | Oui | Oui | **Oui** | Non | Non |
| Encaisser | Oui | Non | Non | **Oui** | Non |
| Annuler une vente | Oui | **Oui** | Non | Non | Non |
| Rembourser | Oui | **Oui** | Non | Non | Non |
| Ouvrir/fermer caisse | Non | Non | Non | **Oui** | Non |
| Gerer le stock | Oui | Oui | Non | Non | **Oui** |
| Transferts stock | Oui | **Oui** (approuve) | Non | Non | **Oui** (cree) |
| Inventaires | Oui | Oui | Non | Non | **Oui** |
| Gerer produits | Oui | **Oui** | Lecture | Lecture | Lecture |
| Gerer clients | Oui | Oui | Oui | Non | Non |
| Credits | Oui | **Oui** | Non | Non | Non |
| Devis | Oui | Oui (valide) | **Oui** (cree) | Non | Non |
| Achats | Oui | **Oui** | Non | Non | Non |
| Depenses | Selon config | Selon config | Selon config | Non | Non |
| Rapports | Oui | **Oui** | Non | Non | Non |
| Analytics | Oui | **Oui** | Non | Non | Non |
| Objectifs vendeur | Admin | Admin | **Lecture** | Non | Non |
| Utilisateurs | **Oui** | Limite | Non | Non | Non |
| Parametres magasin | **Oui** | Oui | Non | Non | Non |

> **Roles supplementaires** : Commercial (acces CRM), HR (acces GRH).

---

## 23. Questions frequentes (FAQ)

### Je ne vois pas certains menus dans la barre laterale
Les menus affiches dependent de votre **role** et des **modules actifs** pour votre magasin. Contactez votre administrateur pour verifier vos droits.

### Comment changer mon mot de passe ?
Allez dans **Mon profil** > **Changer le mot de passe**.

### Je ne peux pas annuler une vente
L'annulation de ventes est reservee aux **Managers** et **Admins**. Contactez votre responsable.

### Le stock ne diminue pas apres une vente
Selon la configuration de votre magasin, le stock peut diminuer :
- **Au paiement** : le stock diminue uniquement quand la vente est completement payee
- **A la validation** : le stock diminue des la soumission en caisse

Verifiez la configuration dans **Parametres** > **Stock**.

### Comment faire une vente a credit ?
1. Assurez-vous que le client a un **compte credit** actif avec un solde suffisant
2. Lors du paiement, selectionnez **Credit** comme mode de paiement

### Comment generer un avoir ?
Creez un **remboursement** depuis la vente concernee. Un numero d'avoir (AVO-XXX) sera genere automatiquement.

### Comment transférer du stock entre magasins ?
Allez dans **Stock** > **Transferts** > **Nouveau transfert**. Le magasin de destination doit confirmer la reception.

### Comment verifier l'authenticite d'une facture ?
Scannez le **QR code** present sur la facture ou entrez le lien de verification dans un navigateur.

### Comment exporter mes donnees ?
La plupart des listes (produits, clients, ventes, depenses, employes) proposent un bouton **Exporter CSV** qui telecharge un fichier compatible avec Excel.

### Je ne peux pas me connecter
- Verifiez votre adresse email et mot de passe
- Utilisez **Mot de passe oublie** pour reinitialiser
- Contactez votre administrateur si votre compte est desactive

### Comment contacter le support ?
Contactez votre administrateur systeme qui pourra escalader au support technique si necessaire.

---

*Document genere automatiquement — Systeme de Gestion Commerciale, mars 2026.*
