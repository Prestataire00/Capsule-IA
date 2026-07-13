-- Force PostgREST à recharger son cache de schéma.
-- Après la migration 0106 (ajout de app.sessions.formation_id), le cache de
-- schéma de PostgREST peut ne pas connaître la nouvelle colonne : toute requête
-- qui sélectionne `formation_id` échoue alors avec une « erreur base de données »
-- (page /sessions, carte Sessions d'une formation) tant que le cache n'est pas
-- rafraîchi. Ce NOTIFY déclenche le rechargement immédiat.
NOTIFY pgrst, 'reload schema';
