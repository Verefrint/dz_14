import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-tracer";
import '@typechain/hardhat'
import "@nomiclabs/hardhat-solhint";
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://mainnet.infura.io/v3/b9a1b49603bf4df8acad1b254c6cf933",
        blockNumber: 21801633, 
      }
    }
  }
};

export default config;