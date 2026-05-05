# UI Component Documentation

Complete documentation for all UI components created during the UI Enhancement Project.

## Table of Contents

1. [Foundation Components](#foundation-components)
2. [Core Components](#core-components)
3. [Layout Components](#layout-components)
4. [Animation & Polish](#animation--polish)
5. [Accessibility](#accessibility)
6. [Performance](#performance)

---

## Foundation Components

### Button (`components/ui/button.tsx`)
Enhanced button component with gradient and loading states.

**Variants:**
- `default` - Primary button with shadow on hover
- `gradient` - Gradient background with glow effect
- `outline` - Outlined button
- `secondary` - Secondary style
- `ghost` - Ghost style
- `destructive` - Destructive action
- `link` - Link style

**Sizes:** xs, sm, default, lg, icon, icon-xs, icon-sm, icon-lg

**Props:**
- `loading?: boolean` - Show loading spinner
- `variant?: string` - Button variant
- `size?: string` - Button size

**Example:**
```tsx
<Button variant="gradient" loading={isLoading}>
  Submit
</Button>
```

### Card (`components/ui/card.tsx`)
Enhanced card component with glass morphism and hover effects.

**Variants:**
- `default` - Standard card with hover lift
- `glass` - Glass morphism (dark)
- `glassLight` - Glass morphism (light)
- `elevated` - Higher shadow level
- `outline` - Outlined style

**Props:**
- `variant?: string` - Card variant

**Example:**
```tsx
<Card variant="glass" className="p-6">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>Card content</CardContent>
</Card>
```

### Floating Label Input (`components/ui/floating-label-input.tsx`)
Modern input with floating label pattern.

**Props:**
- `label: string` - Input label
- `id: string` - Input ID
- `value?: string` - Input value
- `error?: string` - Error message
- `helperText?: string` - Helper text

**Example:**
```tsx
<FloatingLabelInput
  label="Email"
  id="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
  helperText="Enter your email address"
/>
```

### Status Indicator (`components/ui/status-indicator.tsx`)
Status indicators with semantic colors.

**Components:**
- `StatusIndicator` - Full badge with icon and label
- `StatusDot` - Simple circular indicator
- `StatusPill` - Pill-shaped with optional dot

**Variants:** stable, critical, maintenance, pending, success, warning, info

**Sizes:** sm, default, lg

**Example:**
```tsx
<StatusIndicator variant="stable" label="Online" pulse />
<StatusDot variant="critical" size="lg" pulse />
```

---

## Core Components

### Collapsible Sidebar (`components/admin/sidebar.tsx`)
Navigation sidebar with mini-mode and collapsible functionality.

**Features:**
- Mini-mode (64px width) with tooltips
- localStorage persistence
- Smooth 300ms transitions
- Stage icons in mini-mode
- Keyboard navigation

**Example:**
```tsx
<AdminSidebar />
```

### Enhanced Table (`components/ui/table.tsx`)
Data table with sticky headers and row hover effects.

**Features:**
- Sticky headers with backdrop blur
- Enhanced row hover effects
- Improved typography
- Selected state styling

**Example:**
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Doe</TableCell>
      <TableCell><StatusIndicator variant="stable" label="Active" /></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Skeleton Loading States (`components/ui/skeleton.tsx`)
Comprehensive skeleton loading components.

**Components:**
- `SkeletonCard` - Card skeleton
- `SkeletonTable` - Table skeleton (configurable rows/cols)
- `SkeletonList` - List skeleton with avatars
- `SkeletonAvatar` - Avatar skeleton
- `SkeletonText` - Multi-line text skeleton
- `SkeletonButton` - Button skeleton
- `SkeletonDashboardWidget` - Dashboard widget skeleton

**Example:**
```tsx
<SkeletonTable rows={5} cols={4} />
<SkeletonCard />
```

---

## Layout Components

### Container System (`components/ui/container.tsx`)
Responsive container system with breakpoint awareness.

**Components:**
- `Container` - Max-width constrained container
- `Section` - Section-level container with backgrounds
- `ResponsiveGrid` - Grid with breakpoint columns
- `ResponsiveFlex` - Flex with responsive direction

**Sizes:** xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl, 7xl, full, screen

**Example:**
```tsx
<Container size="7xl" padding="default">
  <ResponsiveGrid cols={{ xs: 1, sm: 2, md: 3 }}>
    <div>Item 1</div>
    <div>Item 2</div>
  </ResponsiveGrid>
</Container>
```

### Dashboard Grid (`components/ui/dashboard-grid.tsx`)
Draggable dashboard grid with widget management.

**Components:**
- `DashboardGrid` - Main grid container
- `DashboardWidget` - Individual widget

**Features:**
- HTML5 drag-and-drop
- Configurable columns
- Reorder callback
- Visual feedback during drag

**Example:**
```tsx
<DashboardGrid
  editable={true}
  onReorder={(newOrder) => console.log(newOrder)}
>
  <DashboardWidget id="widget-1" title="Widget 1">
    Content
  </DashboardWidget>
</DashboardGrid>
```

### Mobile Drawer (`components/ui/mobile-drawer.tsx`)
Mobile navigation drawer component.

**Components:**
- `MobileDrawer` - Main drawer
- `MobileDrawerTrigger` - Trigger button
- `MobileDrawerContent` - Scrollable content
- `MobileDrawerItem` - Navigation items
- `MobileDrawerSection` - Grouped sections

**Features:**
- Slide-in from left or right
- Overlay with backdrop blur
- Body scroll lock
- Escape key to close

**Example:**
```tsx
<MobileDrawer open={isOpen} onOpenChange={setIsOpen} side="left">
  <MobileDrawerContent>
    <MobileDrawerSection title="Navigation">
      <MobileDrawerItem href="/dashboard" icon={<LayoutDashboard />}>
        Dashboard
      </MobileDrawerItem>
    </MobileDrawerSection>
  </MobileDrawerContent>
</MobileDrawer>
```

### Masonry Layout (`components/ui/masonry-layout.tsx`)
Pinterest-style masonry layout for varying height items.

**Components:**
- `MasonryLayout` - JavaScript-based masonry
- `ResponsiveMasonry` - CSS columns-based masonry
- `MasonryCard` - Pre-styled card
- `MasonryImage` - Image with loading state
- `MasonryItem` - Item wrapper

**Example:**
```tsx
<MasonryLayout columns={{ xs: 1, sm: 2, lg: 3 }} gap="default">
  <MasonryCard variant="glass">
    <MasonryImage src="/image.jpg" alt="Image" />
  </MasonryCard>
</MasonryLayout>
```

---

## Animation & Polish

### Page Transitions (`components/ui/page-transition.tsx`)
Page transition animations.

**Components:**
- `PageTransition` - Wrapper with variants
- `StaggerChildren` - Stagger children animation
- `ViewTransition` - Route transition
- `AnimatedList` - List with stagger
- `AnimatedGrid` - Grid with stagger
- `FadeInUp` - Fade in up animation
- `PulseOnMount` - Pulse on mount

**Variants:** fade, slideUp, slideDown, slideLeft, slideRight, scale, none

**Example:**
```tsx
<PageTransition variant="slideUp" delay="medium">
  <h1>Page Title</h1>
</PageTransition>
```

### Interactive States (`components/ui/interactive-states.tsx`)
Hover and focus state refinements.

**Components:**
- `Interactive` - Generic wrapper
- `HoverCard` - Card with lift effect
- `FocusRing` - Focus ring element
- `Pressable` - Press/scale effect
- `RippleEffect` - Material ripple
- `ShimmerEffect` - Shimmer on hover
- `MagneticButton` - Cursor-following button
- `HoverGlow` - Glow on hover

**Example:**
```tsx
<HoverCard lift glow>
  <Card>Content</Card>
</HoverCard>
```

### Enhanced Toast (`components/ui/enhanced-toast.tsx`)
Toast notifications with progress indicators.

**Functions:**
- `showSuccessToast` - Success toast
- `showErrorToast` - Error toast
- `showWarningToast` - Warning toast
- `showInfoToast` - Info toast
- `showProgressToast` - Progress bar toast
- `showActionToast` - Toast with action button
- `showCountdownToast` - Countdown toast
- `showRichToast` - Rich content toast

**Example:**
```tsx
showProgressToast("Uploading...", 45, "Processing file...")
showActionToast("File deleted", "Undo", handleUndo)
```

### Empty States (`components/ui/empty-state.tsx`)
Empty state illustrations.

**Components:**
- `EmptyState` - Base component
- `EmptyStateNoResults` - No results state
- `EmptyStateNoData` - No data state
- `EmptyStateNoItems` - No items state
- `EmptyStateNoDocuments` - No documents state
- `EmptyStateNoUsers` - No users state
- `EmptyStateError` - Error state
- `EmptyStateSuccess` - Success state
- `EmptyStateLoading` - Loading state
- `EmptyStateIllustration` - Custom illustration
- `EmptyStateMinimal` - Compact variant

**Example:**
```tsx
<EmptyStateNoResults onClear={handleClear} />
<EmptyStateError message="Failed to load data" onRetry={handleRetry} />
```

### Celebration (`components/ui/celebration.tsx`)
Success celebration animations.

**Components:**
- `SuccessCheckmark` - Animated checkmark
- `Confetti` - Full-screen confetti
- `SparkleEffect` - Sparkle effect
- `TrophyAnimation` - Trophy animation
- `StarRating` - Animated star rating
- `SuccessBanner` - Success banner
- `PulseSuccess` - Pulse success wrapper
- `CelebrationModal` - Full-screen celebration

**Example:**
```tsx
<SuccessCheckmark size="xl" />
<Confetti count={100} duration={5000} />
<CelebrationModal show={show} onClose={handleClose} />
```

---

## Accessibility

### Accessibility Utilities (`components/ui/accessibility.tsx`)
Accessibility helpers and components.

**Components:**
- `SkipLink` - Skip to content link
- `VisuallyHidden` - Screen reader only content
- `FocusTrap` - Trap focus in modal
- `LiveRegion` - Announce dynamic content
- `Announcer` - Programmatic announcements
- `FocusVisible` - Custom focus visible
- `AccessibleButton` - Accessible button
- `AccessibleHeading` - Proper heading levels
- `Landmark` - Semantic landmarks
- `ScreenReaderOnly` - Screen reader content

**Hook:**
- `useFocusManagement` - Focus management utilities

**Example:**
```tsx
<SkipLink href="#main">Skip to main content</SkipLink>
<FocusTrap enabled={isOpen}>
  <Modal>Content</Modal>
</FocusTrap>
```

### Keyboard Navigation (`components/ui/keyboard-navigation.tsx`)
Keyboard navigation utilities.

**Components:**
- `KeyboardShortcutBadge` - Display shortcuts
- `KeyboardNavList` - Keyboard navigable list
- `KeyboardDialog` - Keyboard dialog
- `KeyboardMenu` - Keyboard menu
- `KeyboardTooltip` - Tooltip with shortcuts
- `KeyboardShortcutsProvider` - Global shortcuts

**Hook:**
- `useKeyboardShortcuts` - Keyboard shortcut handler

**Example:**
```tsx
const shortcuts = [
  { key: "k", ctrl: true, callback: openSearch, description: "Open search" }
]
useKeyboardShortcuts(shortcuts)
<KeyboardShortcutBadge shortcut={["Ctrl", "K"]} />
```

---

## Performance

### Performance Utilities (`components/ui/performance.tsx`)
Performance optimization components.

**Components:**
- `LazyComponent` - Lazy load components
- `LazyImage` - Lazy load images
- `VirtualList` - Virtual scrolling list
- `CodeSplit` - Dynamic import wrapper
- `DebouncedComponent` - Debounce updates
- `MemoComponent` - Memoize renders
- `ResourceHint` - Resource preloading
- `PerformanceMonitor` - Performance monitoring
- `OptimizedImage` - Optimized image

**Hook:**
- `useRequestIdleCallback` - Run tasks during idle time

**Example:**
```tsx
<VirtualList
  items={largeList}
  itemHeight={50}
  containerHeight={400}
  renderItem={(item) => <div>{item.name}</div>}
/>
<LazyImage src="/image.jpg" alt="Description" width={400} height={300} />
```

---

## CSS Utilities

### Glass Morphism
- `glass` - Standard glass effect
- `glass-dark` - Dark glass effect
- `glass-subtle` - Subtle glass
- `glass-strong` - Strong glass

### Shadows
- `shadow-elevation-1` to `shadow-elevation-5` - Elevation shadows
- `shadow-primary`, `shadow-success`, `shadow-warning`, `shadow-critical` - Colored shadows
- `shadow-primary-glow` - Glow effect
- `shadow-inset-sm/md/lg` - Inset shadows

### Typography
- `text-display-2xl/xl/lg` - Display fonts
- `text-heading-xl/lg/md/sm` - Heading fonts
- `font-tabular-nums` - Tabular figures
- `tracking-tight/normal/wide/wider/widest` - Letter spacing

### Animations
- `animate-fade-in/out` - Fade animations
- `animate-slide-up/down/left/right` - Slide animations
- `animate-scale-in/out` - Scale animations
- `animate-pulse-subtle` - Subtle pulse
- `animate-fall` - Fall animation (confetti)

---

## Design Tokens

### Semantic Colors
- `critical`, `stable`, `maintenance`, `pending` - Status colors
- Available in all themes (Light, Dark, ShadowGrok)

### Spacing Scale
- 8pt grid system: `spacing-0` to `spacing-24`

### Shadow System
- 5 elevation levels
- Colored shadows for semantic colors
- Inset shadows for pressed states

---

## Usage Guidelines

### 1. Always use semantic colors for status
```tsx
// Good
<StatusIndicator variant="stable" label="Online" />

// Avoid
<div className="text-green-500">Online</div>
```

### 2. Use skeleton states for loading
```tsx
{isLoading ? <SkeletonTable /> : <Table>{data}</Table>}
```

### 3. Implement keyboard navigation
```tsx
<KeyboardNavList orientation="vertical">
  {items.map((item) => (
    <button key={item.id}>{item.label}</button>
  ))}
</KeyboardNavList>
```

### 4. Add accessibility attributes
```tsx
<button aria-label="Close dialog" aria-expanded={isOpen}>
  <X />
</button>
```

### 5. Use performance optimizations for large lists
```tsx
<VirtualList items={largeArray} itemHeight={50} containerHeight={400} />
```

---

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Backdrop blur support with fallback
- CSS Grid and Flexbox
- CSS Custom Properties
- Intersection Observer API

---

## Contributing

When adding new components:
1. Follow existing patterns
2. Add TypeScript types
3. Include accessibility attributes
4. Document props and examples
5. Test keyboard navigation
6. Verify contrast ratios

---

## Changelog

### Phase 1 (Foundation)
- Extended design tokens
- Glass morphism utilities
- Enhanced typography
- Button upgrades
- Card enhancements

### Phase 2 (Core Components)
- Collapsible sidebar
- Enhanced tables
- Skeleton states
- Floating label input
- Status indicators

### Phase 3 (Layout)
- Container system
- Dashboard grid
- Modal enhancements
- Mobile drawer
- Masonry layout

### Phase 4 (Polish)
- Page transitions
- Interactive states
- Enhanced toasts
- Empty states
- Celebrations

### Phase 5 (Accessibility & Performance)
- Accessibility utilities
- Keyboard navigation
- Performance optimizations
- Documentation
- Reduced motion support

---

## Support

For issues or questions:
1. Check component documentation
2. Review examples
3. Test in different browsers
4. Verify accessibility compliance