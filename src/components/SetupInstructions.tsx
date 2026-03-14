import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { AlertCircle } from 'lucide-react';

export function SetupInstructions() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration initiale - Solution Hmad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Pour créer le premier compte administrateur, utilisez l'API directement
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <h3 className="text-lg">Étape 1: Créer le compte administrateur</h3>
            <p className="text-sm text-gray-600">
              Utilisez cURL, Postman ou tout client HTTP pour créer le premier utilisateur admin:
            </p>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`curl -X POST \\
  https://[PROJECT_ID].supabase.co/functions/v1/super-handler/auth/signup \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "admin@hmad.com",
    "password": "admin123",
    "name": "Administrateur",
    "role": "admin",
    "boutique": "Admin"
  }'`}
            </pre>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg">Étape 2: Se connecter</h3>
            <p className="text-sm text-gray-600">
              Après avoir créé le compte, vous pouvez vous connecter avec:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>Email: admin@hmad.com</li>
              <li>Mot de passe: admin123</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg">Configuration Supabase</h3>
            <p className="text-sm text-gray-600">
              L'application utilise Supabase pour:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>Authentification des utilisateurs</li>
              <li>Base de données PostgreSQL (via KV store)</li>
              <li>API REST sécurisée</li>
            </ul>
          </div>

          <Alert>
            <AlertDescription>
              Toutes les données sont stockées dans la base de données Supabase.
              Rien n'est stocké localement dans le navigateur.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
