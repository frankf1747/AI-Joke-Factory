/* ApiError is re-exported here so a migrating view has ONE import path: it has
   to branch on `code` / `field` to tell a validation failure from a transport
   failure, and importing the routes from this barrel while reaching past it to
   '../apiClient' for the error class is the kind of split that quietly rots. */
export { ApiError } from '../apiClient';

export { sessionApi } from './session';
export { teamApi } from './team';
export { marketingApi } from './marketing';
export { instructorApi } from './instructor';
