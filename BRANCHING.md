# Estrategia de ramas

## Ramas principales

| Rama    | Uso                                      | Deploy     |
|---------|------------------------------------------|------------|
| `main`  | Código en producción, estable             | Vercel     |
| `develop` | Integración, cambios en curso           | (opcional) |

## Flujo de trabajo

### Para nuevas funcionalidades
```bash
# Crear rama desde develop
git checkout develop
git pull
git checkout -b feature/nombre-feature

# Trabajar, hacer commits...
git add .
git commit -m "feat: descripción"

# Subir y crear PR hacia develop
git push -u origin feature/nombre-feature
```

### Para correcciones urgentes en producción
```bash
git checkout main
git pull
git checkout -b hotfix/descripcion

# Corregir, commitear...
git add .
git commit -m "fix: descripción"

# PR hacia main (y luego merge a develop)
git push -u origin hotfix/descripcion
```

### Integrar develop en main (cuando esté listo para producción)
```bash
git checkout main
git pull
git merge develop
git push origin main
```

## Convención de nombres
- `feature/*` — Nueva funcionalidad
- `fix/*` — Corrección de bugs
- `hotfix/*` — Corrección urgente en producción
- `refactor/*` — Refactorización sin cambiar comportamiento
