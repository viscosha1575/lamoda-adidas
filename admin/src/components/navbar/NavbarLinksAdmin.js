// Chakra Imports
import {
  Button,
  Flex,
  Icon,
  useColorModeValue,
  useColorMode,
} from '@chakra-ui/react';
import { SidebarResponsive } from 'components/sidebar/Sidebar';
import PropTypes from 'prop-types';
import React from 'react';
import { IoMdMoon, IoMdSunny } from 'react-icons/io';
import routes from 'routes';
export default function HeaderLinks(props) {
  const { colorMode, toggleColorMode } = useColorMode();
  // Chakra Color Mode
  const navbarIcon = useColorModeValue('gray.400', 'white');
  const buttonBg = useColorModeValue('white', 'navy.800');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)',
  );

  return (
    <Flex
      w={{ sm: '100%', md: 'auto' }}
      alignItems="center"
      flexDirection="row"
      flexWrap={{ base: 'wrap', md: 'nowrap' }}
      gap="10px"
    >
      <SidebarResponsive routes={routes} />

      <Button
        variant="no-hover"
        bg={buttonBg}
        p="0px"
        minW="unset"
        minH="unset"
        h="48px"
        w="48px"
        borderRadius="999px"
        boxShadow={shadow}
        onClick={toggleColorMode}
        aria-label="Сменить тему"
        _hover={{ bg: buttonBg }}
        _active={{ bg: buttonBg }}
      >
        <Icon
          h="18px"
          w="18px"
          color={navbarIcon}
          as={colorMode === 'light' ? IoMdMoon : IoMdSunny}
        />
      </Button>
    </Flex>
  );
}

HeaderLinks.propTypes = {
  variant: PropTypes.string,
  fixed: PropTypes.bool,
  onOpen: PropTypes.func,
};
