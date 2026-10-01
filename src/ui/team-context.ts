import { createContext, useContext } from 'react';

/** Whether the open research is shared, and who "you" are; lets rows show teammates' avatars. */
export const TeamContext = createContext<{ shared: boolean; meId?: string }>({ shared: false });
export const useTeam = () => useContext(TeamContext);
