<template>
  <div class="chat-page">
    <h1>Chat Room: {{ $route.params.roomId }}</h1>
    <p>Chat UI — coming in Day 4</p>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
const $route = useRoute()
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 1rem;
}
</style>
