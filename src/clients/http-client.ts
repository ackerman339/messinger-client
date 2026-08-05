import axios, { AxiosError } from 'axios';

export const httpClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/${import.meta.env.VITE_API_PREFIX}/${import.meta.env.VITE_API_VERSION}`,
  withCredentials: true,
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      const isOnAuthPage =
        window.location.pathname === '/signin' || window.location.pathname === '/signup';

      if (!isOnAuthPage) {
        window.location.href = '/signin';
      }
    }

    return Promise.reject(error);
  },
);
