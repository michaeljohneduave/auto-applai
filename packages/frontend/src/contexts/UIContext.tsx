import { createContext, type ReactNode, useContext, useState } from 'react';

type SelectedItem = {
  id: string;
  source: 'base' | 'list';
  type: 'md' | 'pdf' | 'form';
} | null;

type UIContextType = {
  selected: SelectedItem;
  selectBaseAsset: (id: string) => void;
  selectListAsset: (itemId: string, kind: 'md' | 'pdf' | 'form') => void;
};

const UIContext = createContext<UIContextType>({
  selected: null,
  selectBaseAsset: () => {},
  selectListAsset: () => {},
});

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [selected, setSelected] = useState<SelectedItem>(null);

  const selectBaseAsset = (id: string) => {
    setSelected({ id, source: 'base', type: 'md' });
  };

  const selectListAsset = (itemId: string, kind: 'md' | 'pdf' | 'form') => {
    setSelected({ id: itemId, source: 'list', type: kind });
  };

  return (
    <UIContext.Provider value={{ selected, selectBaseAsset, selectListAsset }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => useContext(UIContext);
