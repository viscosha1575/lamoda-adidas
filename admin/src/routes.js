import React from 'react';

import { Icon } from '@chakra-ui/react';
import {
  MdBarChart,
  MdCampaign,
  MdCardGiftcard,
  MdEmojiEvents,
  MdPeople,
} from 'react-icons/md';

// Admin Imports
import AnalyticsPage from 'views/admin/analytics';
import PromoCodesPage from 'views/admin/promo-codes';
import PlayersPage from 'views/admin/players';
import RafflePage from 'views/admin/raffle';
import UtmPage from 'views/admin/utm';

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
  {
    name: 'UTM',
    layout: '/admin',
    path: '/utm',
    icon: <Icon as={MdCampaign} width="20px" height="20px" color="inherit" />,
    component: <UtmPage />,
  },
  {
    name: 'Промокоды',
    layout: '/admin',
    path: '/promo-codes',
    icon: <Icon as={MdCardGiftcard} width="20px" height="20px" color="inherit" />,
    component: <PromoCodesPage />,
  },
  {
    name: 'Розыгрыш',
    layout: '/admin',
    path: '/raffle',
    icon: <Icon as={MdEmojiEvents} width="20px" height="20px" color="inherit" />,
    component: <RafflePage />,
  },
];

export default routes;
