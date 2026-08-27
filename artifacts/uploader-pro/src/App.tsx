import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import { MediaPage, NewUploadsPage } from '@/pages/media-pages';
import CollectionsPage from '@/pages/collections';
import DuplicatesPage from '@/pages/duplicates';
import BookmarksPage from '@/pages/bookmarks';
import { UploaderShell } from '@/components/uploader-shell';
import { setAuthTokenGetter } from '@workspace/api-client-react';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const authenticated = Boolean(sessionStorage.getItem('uploader-pro-token'));
  if (!authenticated && location !== '/') return <LoginPage />;
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LoginPage} />
        <Route path="/dashboard"><UploaderShell><DashboardPage /></UploaderShell></Route>
        <Route path="/new"><UploaderShell><NewUploadsPage /></UploaderShell></Route>
        <Route path="/all"><UploaderShell><MediaPage view="all" title="Every frame, accounted for." description="Search the complete archive without losing the quiet rhythm of browsing." /></UploaderShell></Route>
        <Route path="/favourites"><UploaderShell><MediaPage view="favourites" title="The ones worth returning to." description="A small constellation of moments you chose to keep close." /></UploaderShell></Route>
        <Route path="/untagged"><UploaderShell><MediaPage view="untagged" title="Add the missing context." description="A few words can turn a file into a memory. These frames are ready for them." /></UploaderShell></Route>
        <Route path="/collections"><UploaderShell><CollectionsPage /></UploaderShell></Route>
        <Route path="/duplicates"><UploaderShell><DuplicatesPage /></UploaderShell></Route>
        <Route path="/bookmarks"><UploaderShell><BookmarksPage /></UploaderShell></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  setAuthTokenGetter(() => sessionStorage.getItem('uploader-pro-token'));
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
