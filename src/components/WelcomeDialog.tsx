import { useState } from 'react';
import { Dialog } from './Dialog';
import { Pin, BookOpen, LayoutGrid, Sparkles } from 'lucide-react';

interface WelcomeDialogProps
{
  isOpen: boolean;
  onClose: () => void;
}

interface PageContent
{
  title: string;
  description: string;
  image?: string;
  icon: React.ReactNode;
  isOverview?: boolean;
}

const featurePreview = [
  {
    title: 'Pinned Sites',
    description: 'Quick-access icon bar',
    icon: <Pin size={18} />,
  },
  {
    title: 'Live Bookmarks',
    description: 'Bookmarks that act as tabs',
    icon: <BookOpen size={18} />,
  },
  {
    title: 'Spaces',
    description: 'Organize by context',
    icon: <LayoutGrid size={18} />,
  },
];

const pages: PageContent[] = [
  {
    title: 'Welcome',
    description: "Arc browser's sidebar experience for Chrome",
    icon: <Sparkles size={20} />,
    isOverview: true,
  },
  {
    title: 'Pinned Sites',
    description: 'Quick-access icons at the top. Pin your favorite sites for one-click access.',
    image: '/welcome/pinned-sites.png',
    icon: <Pin size={20} />,
  },
  {
    title: 'Live Bookmarks',
    description: 'Bookmarks act as persistent tabs. Click to open, click again to switch. Closing the tab keeps the bookmark.',
    image: '/welcome/live-bookmarks.png',
    icon: <BookOpen size={20} />,
  },
  {
    title: 'Spaces',
    description: 'Focus on what matters. Each space shows only its bookmarks and tabs, reducing clutter.',
    image: '/welcome/spaces.png',
    icon: <LayoutGrid size={20} />,
  },
];

export function WelcomeDialog({ isOpen, onClose }: WelcomeDialogProps)
{
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () =>
  {
    if (currentPage < pages.length - 1)
    {
      setCurrentPage(currentPage + 1);
    }
    else
    {
      onClose();
    }
  };

  const handlePrev = () =>
  {
    if (currentPage > 0)
    {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleClose = () =>
  {
    setCurrentPage(0);
    onClose();
  };

  const page = pages[currentPage];
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === pages.length - 1;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Welcome to SideBar For Arc Users"
      maxWidth="max-w-sm"
    >
      <div className="p-4">
        {page.isOverview ? (
          <>
            {/* Overview page content */}
            <div className="flex flex-col items-center mb-4">
              <img
                src="/icon.png"
                alt="SideBar icon"
                className="w-16 h-16 mb-3"
              />
              <p className="text-gray-600 dark:text-gray-400 text-center">
                {page.description}
              </p>
            </div>

            {/* Feature preview list */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
              {featurePreview.map((feature, index) => (
                <div
                  key={feature.title}
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    index < featurePreview.length - 1
                      ? 'border-b border-gray-200 dark:border-gray-700'
                      : ''
                  }`}
                >
                  <span className="text-blue-500 flex-shrink-0">{feature.icon}</span>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {feature.title}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Title with icon */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-blue-500">{page.icon}</span>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {page.title}
              </h4>
            </div>

            {/* Description */}
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {page.description}
            </p>

            {/* Screenshot */}
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-4">
              <img
                src={page.image}
                alt={page.title}
                className="w-full h-auto"
              />
            </div>
          </>
        )}

        {/* Page indicator dots */}
        <div className="flex justify-center gap-2 mb-4">
          {pages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentPage
                  ? 'bg-blue-500'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
              }`}
              aria-label={`Go to page ${index + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          {!isFirstPage ? (
            <button
              onClick={handlePrev}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              ← Prev
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleNext}
            className="px-4 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {isLastPage ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
