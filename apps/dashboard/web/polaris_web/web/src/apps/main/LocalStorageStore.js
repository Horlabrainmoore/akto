import {create} from "zustand"
import {devtools, persist, createJSONStorage} from "zustand/middleware"

const initialState = {
    subCategoryMap: {},
    categoryMap: {},
    sendEventOnLogin: false,
    defaultIgnoreSummaryTime: 2 * 60 * 60
};

let localStore = (set) => ({
    ...initialState,
    setSubCategoryMap: (subCategoryMap) => set({ subCategoryMap }),
    setCategoryMap: (categoryMap) => set({ categoryMap }),
    setSendEventOnLogin: (sendEventOnLogin) => set({ sendEventOnLogin }),
    setDefaultIgnoreSummaryTime: (val) => set({val}),
    resetStore: () => set(initialState), // Reset function
})

localStore = devtools(localStore)
localStore = persist(localStore,{storage: createJSONStorage(() => localStorage)})

const LocalStore = create(localStore);

window.addEventListener('storage', (event) => {
   if (event.key === 'subCategoryMap') {
    LocalStore.setState({
      subCategoryMap: JSON.parse(event.newValue)
    });
  }
});

export default LocalStore

