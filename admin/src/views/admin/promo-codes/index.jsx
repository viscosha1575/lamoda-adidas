import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { MdUploadFile } from "react-icons/md";
import * as XLSX from "xlsx";
import Card from "components/card/Card";
import MiniStatistics from "components/card/MiniStatistics";
import { postJson } from "api";

const STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "issued", label: "Выданные" },
  { value: "new", label: "Новые" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("ru-RU");
}

function normalizeCode(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || null;
}

function isHeaderLikeCode(value) {
  return /promo|промокод/i.test(String(value || "").trim());
}

function getPromoStatusProps(item) {
  if (item?.assignedPlayerId) {
    return {
      colorScheme: "green",
      label: "Выдан",
    };
  }

  return {
    colorScheme: "gray",
    label: "Новый",
  };
}

function getPlayerLabel(player) {
  if (!player) {
    return "—";
  }

  const fullName = [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
  return fullName || player.username || `Игрок #${player.id}`;
}

async function parsePromoCodesFromFile(file) {
  const fileBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
  });

  return [...new Set(
    rows
      .map((row) => normalizeCode(Array.isArray(row) ? row[0] : null))
      .filter((value, index) => {
        if (!value) {
          return false;
        }

        return !(index === 0 && isHeaderLikeCode(value));
      }),
  )];
}

export default function PromoCodesPage() {
  const fileInputRef = useRef(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [response, setResponse] = useState({
    items: [],
    summary: {
      totalCodesCount: 0,
      issuedCodesCount: 0,
      newCodesCount: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const filterBg = useColorModeValue("white", "navy.800");
  const filterShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPromoCodes() {
      setLoading(true);
      setError("");

      try {
        const nextResponse = await postJson("/api/promo-codes/list", {
          search: deferredSearch,
          status: statusFilter,
        });

        if (!cancelled) {
          setResponse({
            items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
            summary: nextResponse?.summary ?? {
              totalCodesCount: 0,
              issuedCodesCount: 0,
              newCodesCount: 0,
            },
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить промокоды");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPromoCodes();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, statusFilter]);

  const statCards = useMemo(() => ([
    {
      key: "totalCodesCount",
      label: "Всего кодов",
      value: formatNumber(response.summary?.totalCodesCount ?? 0),
    },
    {
      key: "issuedCodesCount",
      label: "Выданные",
      value: formatNumber(response.summary?.issuedCodesCount ?? 0),
    },
    {
      key: "newCodesCount",
      label: "Новые",
      value: formatNumber(response.summary?.newCodesCount ?? 0),
    },
  ]), [response.summary]);

  async function reloadPromoCodes() {
    const nextResponse = await postJson("/api/promo-codes/list", {
      search: deferredSearch,
      status: statusFilter,
    });

    setResponse({
      items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
      summary: nextResponse?.summary ?? {
        totalCodesCount: 0,
        issuedCodesCount: 0,
        newCodesCount: 0,
      },
    });
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploading(true);
    setError("");
    setSuccessMessage("");

    try {
      const codes = await parsePromoCodesFromFile(file);

      if (codes.length === 0) {
        throw new Error("В первой колонке не найдено ни одного промокода");
      }

      let createdCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const code of codes) {
        try {
          const result = await postJson("/api/promo-codes/create", { code });

          if (result?.created) {
            createdCount += 1;
          } else {
            skippedCount += 1;
          }
        } catch {
          failedCount += 1;
        }
      }

      await reloadPromoCodes();
      setSuccessMessage(
        `Загружено: ${createdCount}, пропущено дублей: ${skippedCount}, ошибок: ${failedCount}.`,
      );
    } catch (requestError) {
      setError(requestError.message || "Не удалось загрузить Excel-файл");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAllPromoCodes() {
    const confirmed = window.confirm("Удалить все промокоды из базы? Это действие нельзя отменить.");

    if (!confirmed) {
      return;
    }

    setDeletingAll(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/promo-codes/delete-all", {});
      const deletedCount = Number(result?.deletedCount ?? 0);

      await reloadPromoCodes();
      setSuccessMessage(`Удалено промокодов: ${deletedCount}.`);
    } catch (requestError) {
      setError(requestError.message || "Не удалось удалить промокоды");
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <Box pt={{ base: "0px", md: "80px", xl: "80px" }}>
      <Stack spacing="20px">
        <Card p="24px">
          <Flex
            w="100%"
            align={{ base: "stretch", lg: "center" }}
            justify="center"
            direction={{ base: "column", lg: "row" }}
            gap="12px"
          >
            <Flex
              w="100%"
              align="stretch"
              justify={{ base: "stretch", lg: "space-between" }}
              gap={{ base: "12px", lg: "20px", xl: "28px" }}
              flexWrap={{ base: "wrap", lg: "nowrap" }}
            >
              <InputGroup flex={{ base: "1 1 100%", lg: "1.4 1 0" }} minW="0">
                <InputLeftElement pointerEvents="none" h="56px" ps="8px">
                  <Icon as={SearchIcon} color="secondaryGray.500" boxSize="16px" />
                </InputLeftElement>
                <Input
                  h="56px"
                  minW="0"
                  bg={filterBg}
                  borderColor="transparent"
                  borderRadius="20px"
                  boxShadow={filterShadow}
                  fontSize="sm"
                  fontWeight="500"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по коду или игроку"
                  ps="44px"
                  value={search}
                  _hover={{ borderColor: "transparent" }}
                  _focusVisible={{
                    borderColor: "brand.200",
                    boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                  }}
                />
              </InputGroup>

              <Select
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 220px" }}
                bg={filterBg}
                borderColor="transparent"
                borderRadius="20px"
                boxShadow={filterShadow}
                fontSize="sm"
                fontWeight="600"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <input
                ref={fileInputRef}
                accept=".xlsx,.xls"
                hidden
                onChange={handleFileUpload}
                type="file"
              />
              <Button
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 260px" }}
                bg="brand.500"
                color="white"
                borderRadius="20px"
                fontSize="sm"
                fontWeight="700"
                isLoading={uploading}
                leftIcon={<Icon as={MdUploadFile} boxSize="20px" />}
                loadingText="Загружаем"
                onClick={() => fileInputRef.current?.click()}
                _hover={{ bg: "brand.600" }}
              >
                Загрузить Excel
              </Button>

              <Button
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 260px" }}
                bg="red.400"
                color="white"
                borderRadius="20px"
                fontSize="sm"
                fontWeight="700"
                isLoading={deletingAll}
                loadingText="Удаляем"
                onClick={handleDeleteAllPromoCodes}
                _hover={{ bg: "red.500" }}
              >
                Удалить все промокоды
              </Button>
            </Flex>
          </Flex>
        </Card>

        {error ? (
          <Card p="18px">
            <Text color="red.500" fontWeight="700">
              {error}
            </Text>
          </Card>
        ) : null}

        {successMessage ? (
          <Card p="18px">
            <Text color="green.500" fontWeight="700">
              {successMessage}
            </Text>
          </Card>
        ) : null}

        <SimpleGrid columns={{ base: 1, md: 3 }} gap="20px">
          {statCards.map((card) => (
            <MiniStatistics
              key={card.key}
              name={card.label}
              value={card.value}
            />
          ))}
        </SimpleGrid>

        <Card p={{ base: "18px", md: "24px" }}>
          <Skeleton isLoaded={!loading}>
            <Box overflowX="auto">
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th color={textColorSecondary}>Промокод</Th>
                    <Th color={textColorSecondary}>Статус</Th>
                    <Th color={textColorSecondary}>Игрок</Th>
                    <Th color={textColorSecondary}>Выдан</Th>
                    <Th color={textColorSecondary}>Добавлен</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {response.items.length > 0 ? response.items.map((item) => {
                    const badge = getPromoStatusProps(item);

                    return (
                      <Tr key={item.id}>
                        <Td borderColor={borderColor}>
                          <Badge borderRadius="999px" colorScheme="green" px="10px" py="6px">
                            {item.code}
                          </Badge>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Badge borderRadius="999px" colorScheme={badge.colorScheme} px="10px" py="6px">
                            {badge.label}
                          </Badge>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Stack spacing="4px">
                            <Text color={textColor} fontSize="sm" fontWeight="700">
                              {getPlayerLabel(item.player)}
                            </Text>
                            <Text color={textColorSecondary} fontSize="xs">
                              {item.player?.username ? `@${item.player.username}` : "—"}
                            </Text>
                          </Stack>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text color={textColorSecondary} fontSize="sm">
                            {formatDateTime(item.assignedAt)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text color={textColorSecondary} fontSize="sm">
                            {formatDateTime(item.createdAt)}
                          </Text>
                        </Td>
                      </Tr>
                    );
                  }) : (
                    <Tr>
                      <Td borderColor={borderColor} colSpan={5}>
                        <Text color={textColorSecondary} fontSize="sm" py="12px" textAlign="center">
                          Промокодов пока нет.
                        </Text>
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </Box>
          </Skeleton>
        </Card>
      </Stack>
    </Box>
  );
}
