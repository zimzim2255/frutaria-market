import { useState } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

// Anon key is now properly configured in info.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { LoginScreen } from './LoginScreen';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

interface FirstTimeSetupProps {
  onSetupComplete?: () => void;
}

export function FirstTimeSetup({ onSetupComplete }: FirstTimeSetupProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [formData, setFormData] = useState({
    email: 'admin@hmad.com',
    password: 'admin123',
    name: 'Administrateur Principal',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            ...formData,
            role: 'admin',
            boutique: 'Admin',
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success('Compte administrateur créé avec succès!');
        setSuccess(true);
      } else {
        toast.error(data.error || 'Erreur lors de la création du compte');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Bienvenue sur Solution Hmad</CardTitle>
          <CardDescription>
            Configuration initiale - Création du compte administrateur
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showLogin ? (
            <LoginScreen supabase={supabase} />
          ) : !success ? (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Créez votre premier compte administrateur pour commencer à utiliser l'application.
                </AlertDescription>
              </Alert>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom complet</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                  <p className="text-xs text-gray-500">Minimum 6 caractères</p>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Création en cours...' : 'Créer le compte administrateur'}
                </Button>
              </form>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 text-center mb-2">
                  Alternative: Utilisez cURL ou Postman
                </p>
                <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST \\
  https://${projectId}.supabase.co/functions/v1/super-handler/auth/signup \\
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
            </>
          ) : (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 p-4 rounded-full">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
              </div>
              
              <div>
                <h3 className="text-xl text-green-900 mb-2">Compte créé avec succès!</h3>
                <p className="text-gray-600 mb-4">Vous pouvez maintenant vous connecter avec:</p>
                <div className="bg-gray-50 p-4 rounded-lg text-left space-y-2">
                  <p className="text-sm">
                    <span className="text-gray-600">Email:</span>{' '}
                    <span className="font-mono">{formData.email}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-gray-600">Mot de passe:</span>{' '}
                    <span className="font-mono">{formData.password}</span>
                  </p>
                </div>
              </div>

              <Button 
                onClick={() => setShowLogin(true)} 
                className="w-full"
              >
                Aller à la page de connexion
              </Button>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-sm text-gray-700 mb-2">📋 À propos de Solution Hmad</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Gestion centralisée de plusieurs boutiques</li>
              <li>• Stock, ventes, clients, fournisseurs</li>
              <li>• Chèques, transferts et commandes</li>
              <li>• Toutes les données stockées dans Supabase</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
