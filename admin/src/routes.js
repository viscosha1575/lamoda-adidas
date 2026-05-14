import React from 'react';

import { Icon } from '@chakra-ui/react';
import {
  MdBarChart,
  MdPeople,
} from 'react-icons/md';

// Admin Imports
import AnalyticsPage from 'views/admin/analytics';
import PlayersPage from 'views/admin/players';

const routes = [
  {
    name: 'Аналитика',
    layout: '/admin',
    path: '/analytics',
    icon: <Icon as={MdBarChart} width="20px" height="20px" color="inherit" />,
    component: <AnalyticsPage />,
  },
  {
    name: 'Игроки',
    layout: '/admin',
    path: '/players',
    icon: <Icon as={MdPeople} width="20px" height="20px" color="inherit" />,
    component: <PlayersPage />,
  },
];

export default routes;
