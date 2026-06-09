# Ajuste manual em `src/components/social-components.tsx`

Este arquivo NÃO é para substituir direto. Ele contém os blocos exatos para você copiar e trocar manualmente dentro de:

`src/components/social-components.tsx`

---

## 1) Ajuste do card da lista de posts

Procure este bloco:

```tsx
    <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="grid gap-0 sm:grid-cols-[230px_minmax(0,1fr)]">
        <div className="bg-background/70 p-4">
          <PostPreview post={post} />
        </div>
        <CardContent className="p-5">
```

Substitua por:

```tsx
    <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="grid gap-0">
        <div className="bg-[radial-gradient(circle_at_top,#f9731626,transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[540px]">
            <PostPreview post={post} />
          </div>
        </div>
        <CardContent className="border-t border-border p-5">
```

---

## 2) Ajuste do modal de revisão criativa

Procure este bloco:

```tsx
        className="mx-auto grid max-h-[92vh] max-w-6xl overflow-auto rounded-3xl border border-border bg-card shadow-elevated lg:grid-cols-[0.9fr_1.1fr]"
```

Substitua por:

```tsx
        className="mx-auto max-h-[92vh] max-w-5xl overflow-auto rounded-3xl border border-border bg-card shadow-elevated"
```

---

## 3) Ajuste da área do criativo no modal

Procure este bloco:

```tsx
        <div className="bg-muted p-4">
          <PostPreview
            post={{
```

Substitua por:

```tsx
        <div className="bg-[radial-gradient(circle_at_top,#f9731626,transparent_35%),linear-gradient(180deg,hsl(var(--muted)),hsl(var(--background)))] p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[640px]">
            <PostPreview
              post={{
```

---

## 4) Fechamento do preview e card informativo

Procure este bloco:

```tsx
              scheduledAt: finalScheduledAt,
            }}
          />
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm shadow-soft">
```

Substitua por:

```tsx
              scheduledAt: finalScheduledAt,
            }}
            />
          </div>
          <div className="mx-auto mt-4 max-w-[640px] rounded-2xl border border-border bg-card p-4 text-sm shadow-soft">
```

---

## 5) Painel de edição embaixo

Procure este bloco:

```tsx
        <div className="space-y-5 p-6">
```

Substitua por:

```tsx
        <div className="space-y-5 border-t border-border p-6">
```

---

## Resultado esperado

- O criativo/preview aparece em cima, centralizado e maior.
- O painel de edição fica embaixo.
- O card da lista deixa de ter preview pequeno na lateral.
- O layout fica melhor para posts 4:5 padrão feed 1080x1350.
