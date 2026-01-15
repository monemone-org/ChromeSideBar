import { useState } from 'react';
import { Dialog } from './Dialog';
import { Pin, BookOpen, LayoutGrid } from 'lucide-react';

interface WelcomeDialogProps
{
  isOpen: boolean;
  onClose: () => void;
}

interface PageContent
{
  title: string;
  description: string;
  image: string;
  icon: React.ReactNode;
}

const pages: PageContent[] = [
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
        {/* Screenshot */}
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-4">
          <img
            src={page.image}
            alt={page.title}
            className="w-full h-auto"
          />
        </div>

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
