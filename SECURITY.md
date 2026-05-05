# 🔒 SEGURIDAD - PROTECCIÓN DE CÓDIGO FUENTE Y DATOS

Este documento explica las protecciones de seguridad implementadas en tu aplicación.

---

## ✅ PROTECCIONES IMPLEMENTADAS

### 1. **Protección en el Navegador (index.html)**
✅ Bloquea apertura de DevTools (F12, Ctrl+Shift+I, Ctrl+I)
✅ Deshabilita click derecho (contextmenu)
✅ Detecta si DevTools está abierto y cierra la página
✅ Consola deshabilitada
✅ Previene acceso a herramientas de debugging

### 2. **Optimización de Build (vite.config.ts)**
✅ Source maps DESHABILITADOS en producción
✅ Minificación completa con Terser
✅ Ofuscación de nombres de variables
✅ Remoción de console.log en producción
✅ Remoción de comentarios del código
✅ Eliminación de código no utilizado (tree-shaking)

### 3. **Protección de Environment Variables (.env.local)**
✅ Variables de ambiente en archivo .env.local (no se sube a GitHub)
✅ .gitignore actualizado para excluir .env* files
✅ Ejemplo .env.example SIN valores sensibles

### 4. **Protecciones en Runtime (main.tsx)**
✅ Bloquea acceso a React DevTools
✅ Protección contra acceso a datos sensibles
✅ Window freezing en producción

### 5. **GitHub Security (actualizado .gitignore)**
✅ .env files ignorados
✅ .key y .pem files ignorados
✅ Archivos de credenciales ignorados
✅ Archivos temporales ignorados

---

## 🚨 SI TU CÓDIGO YA FUE EXPUESTO EN GITHUB

### Acciones INMEDIATAS:

1. **Cambiar TODAS las API Keys**
   ```
   - Supabase: ir a https://app.supabase.com → Settings → API Keys → Regenerar
   - Tradier: https://tradier.com/settings/account/api → Regenerar keys
   - Stripe: https://dashboard.stripe.com/apikeys → Crear nuevas keys
   - CBOE: Contactar soporte para regenerar
   ```

2. **Revisar el Histórico de GitHub**
   ```bash
   # Ver qué se commitió
   git log --oneline --all
   
   # Ver cambios específicos
   git show <commit-hash>
   ```

3. **Opciones para Limpiar el Histórico**
   
   **Opción A: Reescribir histórico (Nuclear - ⚠️ CUIDADO)**
   ```bash
   # Instalar BFG Repo Cleaner o usar git-filter-branch
   bfg --delete-files .env
   git reflog expire --expire=now --all && git gc --prune=now --aggressive
   git push origin --force-with-lease
   ```
   
   **Opción B: Hacer repo privado**
   - GitHub Settings → General → Change Repository Visibility → Private
   - Esto previene que otros vean el histórico

4. **Auditar Acceso al Repositorio**
   - GitHub Settings → Collaborators and teams
   - Remover acceso no autorizado
   - Security → Active sessions → revisar sesiones activas

---

## 📋 BUENAS PRÁCTICAS DE SEGURIDAD

### Manejo de Variables de Ambiente

### ✅ CORRECTO:
```typescript
// En .env.local (nunca se sube a GitHub)
VITE_SUPABASE_URL=https://project.supabase.co
VITE_SUPABASE_ANON_KEY=anon-key-value

// Usar en código
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### ❌ INCORRECTO:
```typescript
// ¡NUNCA! hardcodear secretos
const apiKey = "sk_live_abc123def456";
const dbPassword = "super_secret_password_123";
```

### Backend vs Frontend

- **Frontend (visible en navegador)**: Solo usar VITE_*ANON* keys públicas
- **Backend (servidor)**: Guardar secrets de servidor con variables privadas

---

## 🔐 CHECKLIST DE SEGURIDAD

- [ ] .env.local creado y en .gitignore
- [ ] .env.example SIN valores reales
- [ ] Todas las API keys rotadas (después de exposición)
- [ ] GitHub: repo en PRIVADO o histórico limpado
- [ ] DevTools bloqueado en index.html
- [ ] Source maps deshabilitados en build
- [ ] Console.log removido en producción
- [ ] No hay credenciales en archivos commitidos
- [ ] Revisar commits recientes por exposiciones

---

## 🛠️ VERIFICAR PROTECCIONES

### Probar que DevTools está bloqueado:
1. Hacer build: `npm run build`
2. Preview: `npm run preview`
3. Intentar abrir DevTools (F12) → Debe fallar
4. Intentar click derecho → Debe fallar

### Verificar source maps removidos:
```bash
# No debe haber archivos .js.map
ls dist/
# Solo debe ver .js, .css, .html archivos
```

---

## 📞 AYUDA

Si encontraste que tu código fue expuesto:

1. **Cambiar credenciales INMEDIATAMENTE**
2. **Monitorear logs de acceso** en Supabase, Tradier, etc.
3. **Hacer el repo PRIVADO** si es crítico
4. **Contactar soporte** de servicios sensibles

---

## 📚 REFERENCIAS

- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Vite: Build Optimization](https://vitejs.dev/guide/build.html)
- [Terser: JavaScript Compression](https://terser.org/)

---

**Última actualización:** Mayo 5, 2026
**Estado:** ✅ Seguridad mejorada
